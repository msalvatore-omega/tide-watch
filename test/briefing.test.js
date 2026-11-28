import { describe, it, expect, afterEach, vi } from 'vitest'
import { localBriefing, PRESETS } from '../src/briefing.js'
import { tideNow } from '../src/tides.js'
import { findAlerts } from '../src/alerts.js'
import { baltimoreEvents, NOW, BALTIMORE } from './helpers.js'

afterEach(() => vi.unstubAllGlobals())
const FLOOD = { minor: 3.36, moderate: 4.33, major: 5.56 }
const preset = (id) => PRESETS.find((p) => p.id === id)

async function ctx(extra = {}) {
  const events = await baltimoreEvents()
  const tide = tideNow(events, NOW)
  return { now: NOW, events, tide, forecastNow: tide.height, alerts: findAlerts(events, NOW, { mode: 'auto' }).alerts, flood: FLOOD, surgeFeet: 1, station: BALTIMORE, ...extra }
}

describe('at-a-glance briefing (no AI)', () => {
  it('live reading, next tides in order, and the swing under way', async () => {
    const lines = localBriefing(await ctx({ live: { height: 1.4, trend: 'rising', diff: 0.24, predicted: 1.16 } }))
    expect(lines[0]).toBe('Height of tide is 1.4 ft and flooding, 0.2 ft above prediction.')
    expect(lines[1]).toMatch(/^High water at 7:06\sPM \(1\.8 ft\), then low water at 2:30\sAM \(0\.2 ft\)\.$/)
    expect(lines.join(' ')).toMatch(/A larger range than usual is under way: a rise of 2\.0 ft to high water at 7:06\sPM\./)
    expect(lines.join(' ')).not.toMatch(/flood stage/) // "flooding" here means the tide making, not coastal flooding
    expect(lines.length).toBeLessThanOrEqual(4)
  })
  it('copes when only one more high or low water is left in the loaded predictions', async () => {
    const c = await ctx({ live: null, alerts: [] })
    const lines = localBriefing({ ...c, tide: { ...c.tide, nextLow: undefined } })
    expect(lines[1]).toMatch(/^High water at 7:06\sPM \(1\.8 ft\)\.$/)
    expect(() => localBriefing({ ...c, tide: { ...c.tide, nextLow: undefined, nextHigh: undefined } })).not.toThrow()
  })
  it('falls back to the forecast without a gauge, and stays quiet about a small gap', async () => {
    const noGauge = localBriefing(await ctx({ live: null }))
    expect(noGauge[0]).toMatch(/^Predicted height of tide is about \d\.\d ft, flooding \(no gauge observation\)\.$/)
    const onForecast = localBriefing(await ctx({ live: { height: 1.2, trend: 'steady', diff: 0.05 } }))
    expect(onForecast[0]).toBe('Height of tide is 1.2 ft and at stand.')
  })
  it('leads with flooding when the gauge is at flood level', async () => {
    const lines = localBriefing(await ctx({ live: { height: 3.8, trend: 'rising', diff: 2.6 } }))
    expect(lines[2]).toBe('That is minor flood stage (minor flood stage is 3.4 ft).')
    expect(lines[3]).toMatch(/Wind set-up or storm surge is raising the water/)
  })
  it('warns when the next high would flood only because of the current surge', async () => {
    const lines = localBriefing(await ctx({ live: { height: 2.9, trend: 'rising', diff: 1.7 } }))
    expect(lines.join(' ')).toMatch(/The 7:06\sPM high water could reach minor flood stage if the water stays this far above prediction; minor flood stage is 3\.4 ft\./)
  })
  it('mentions strong wind, ignores light or stale wind', async () => {
    const strong = localBriefing(await ctx({ live: null, alerts: [], weather: { wind: { knots: 18, gust: 26, dir: 'NW', time: NOW } } }))
    expect(strong.at(-1)).toBe('Wind NW 18 kt (Force 5), gusting 26.')
    expect(localBriefing(await ctx({ live: null, alerts: [], weather: { wind: { knots: 8, dir: 'NW', time: NOW } } })).join(' ')).not.toMatch(/Wind NW/)
    expect(localBriefing(await ctx({ live: null, alerts: [], weather: { wind: { knots: 18, dir: 'NW', time: new Date(NOW - 5 * 3600e3) } } })).join(' ')).not.toMatch(/Wind NW/)
  })
})

describe('preset questions (no AI)', () => {
  it('lowest tide this weekend (Sat 28 / Sun 29 Nov 2026), with the daylight alternative', async () => {
    const c = await ctx()
    const answer = preset('weekend-low').answer(c)
    const weekendLows = c.events.filter((e) => e.type === 'L' && /2026-11-2[89]/.test(e.local))
    const lowest = Math.min(...weekendLows.map((e) => e.height))
    expect(answer).toMatch(/^The lowest low water this weekend is (Sat|Sun) \d{1,2}:\d{2}\s[AP]M at -?\d\.\d ft, (in daylight|after dark)\./)
    expect(answer).toContain(`${lowest.toFixed(1)} ft`)
  })
  it('flooding this week: none forecast, with the gap to flood level', async () => {
    const answer = preset('flood-week').answer(await ctx())
    expect(answer).toMatch(/^None predicted\. The highest high water this week is 1\.8 ft on Wed 7:06\sPM, 1\.6 ft below minor flood stage \(3\.4 ft\)\./)
    const surging = preset('flood-week').answer(await ctx({ live: { diff: 0.8 } }))
    expect(surging).toMatch(/running 0\.8 ft above prediction, which narrows that margin/)
  })
  it('flooding this week: lists high tides at flood level, and handles stations with no flood levels', async () => {
    const low = { minor: 1.7, moderate: 1.75, major: 9 }
    const yes = preset('flood-week').answer(await ctx({ flood: low }))
    expect(yes).toMatch(/^Yes: \d+ high waters? (is|are) predicted to reach flood stage this week: Wed 7:06\sPM \(1\.8 ft, moderate\)/)
    expect(preset('flood-week').answer(await ctx({ flood: null }))).toMatch(/publishes no flood stages.*highest predicted high water this week is 1\.8 ft/)
  })
  it('highest/lowest this week and the next daylight low', async () => {
    expect(preset('highest-week').answer(await ctx())).toMatch(/^Highest high water: 1\.8 ft on Wed 7:06\sPM, after dark\. Lowest low water: -0\.\d ft on \w{3} \d{1,2}:\d{2}\s[AP]M, (in daylight|after dark)\.$/)
    expect(preset('daylight-low').answer(await ctx())).toMatch(/^Low water Thu 1:01\sPM, -0\.2 ft\.$/)
    expect(preset('daylight-low').answer(await ctx({ station: { id: 'x' } }))).toMatch(/no location on record/)
  })
})
