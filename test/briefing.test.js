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
    expect(lines[0]).toBe('The water is at 1.4 ft and rising, 0.2 ft above the forecast.')
    expect(lines[1]).toMatch(/^High tide is at 7:06\sPM \(1\.8 ft\), then low at 2:30\sAM \(0\.2 ft\)\.$/)
    expect(lines.join(' ')).toMatch(/A bigger swing than usual is under way: the water rises 2\.0 ft by 7:06\sPM\./)
    expect(lines.join(' ')).not.toMatch(/flood/)
    expect(lines.length).toBeLessThanOrEqual(4)
  })
  it('falls back to the forecast without a gauge, and stays quiet about a small gap', async () => {
    const noGauge = localBriefing(await ctx({ live: null }))
    expect(noGauge[0]).toMatch(/^The water is around \d\.\d ft and coming in \(forecast; no live reading\)\.$/)
    const onForecast = localBriefing(await ctx({ live: { height: 1.2, trend: 'steady', diff: 0.05 } }))
    expect(onForecast[0]).toBe('The water is at 1.2 ft and holding steady.')
  })
  it('leads with flooding when the gauge is at flood level', async () => {
    const lines = localBriefing(await ctx({ live: { height: 3.8, trend: 'rising', diff: 2.6 } }))
    expect(lines[2]).toBe('That is minor flood level (flooding starts at 3.4 ft).')
    expect(lines[3]).toMatch(/Wind or a storm is pushing the water up/)
  })
  it('warns when the next high would flood only because of the current surge', async () => {
    const lines = localBriefing(await ctx({ live: { height: 2.9, trend: 'rising', diff: 1.7 } }))
    expect(lines.join(' ')).toMatch(/The 7:06\sPM high could reach minor flood level if the water stays this far above the forecast; flooding starts at 3\.4 ft\./)
  })
  it('mentions strong wind, ignores light or stale wind', async () => {
    const strong = localBriefing(await ctx({ live: null, alerts: [], weather: { wind: { knots: 18, gust: 26, dir: 'NW', time: NOW } } }))
    expect(strong.at(-1)).toBe('Wind is NW 21 mph, gusting 30.')
    expect(localBriefing(await ctx({ live: null, alerts: [], weather: { wind: { knots: 8, dir: 'NW', time: NOW } } })).join(' ')).not.toMatch(/Wind is/)
    expect(localBriefing(await ctx({ live: null, alerts: [], weather: { wind: { knots: 18, dir: 'NW', time: new Date(NOW - 5 * 3600e3) } } })).join(' ')).not.toMatch(/Wind is/)
  })
})

describe('preset questions (no AI)', () => {
  it('lowest tide this weekend (Sat 28 / Sun 29 Nov 2026), with the daylight alternative', async () => {
    const c = await ctx()
    const answer = preset('weekend-low').answer(c)
    const weekendLows = c.events.filter((e) => e.type === 'L' && /2026-11-2[89]/.test(e.local))
    const lowest = Math.min(...weekendLows.map((e) => e.height))
    expect(answer).toMatch(/^The lowest tide this weekend is (Sat|Sun) \d{1,2}:\d{2}\s[AP]M at -?\d\.\d ft, (in daylight|after dark)\./)
    expect(answer).toContain(`${lowest.toFixed(1)} ft`)
  })
  it('flooding this week: none forecast, with the gap to flood level', async () => {
    const answer = preset('flood-week').answer(await ctx())
    expect(answer).toMatch(/^None is forecast\. The highest tide this week is 1\.8 ft on Wed 7:06\sPM, 1\.6 ft below where minor flooding starts \(3\.4 ft\)\./)
    const surging = preset('flood-week').answer(await ctx({ live: { diff: 0.8 } }))
    expect(surging).toMatch(/running 0\.8 ft above the forecast/)
  })
  it('flooding this week: lists high tides at flood level, and handles stations with no flood levels', async () => {
    const low = { minor: 1.7, moderate: 1.75, major: 9 }
    const yes = preset('flood-week').answer(await ctx({ flood: low }))
    expect(yes).toMatch(/^Yes: \d+ high tides? (is|are) forecast to reach flood level this week: Wed 7:06\sPM \(1\.8 ft, moderate\)/)
    expect(preset('flood-week').answer(await ctx({ flood: null }))).toMatch(/doesn't publish flood levels.*highest forecast tide this week is 1\.8 ft/)
  })
  it('highest/lowest this week and the next daylight low', async () => {
    expect(preset('highest-week').answer(await ctx())).toMatch(/^Highest: 1\.8 ft on Wed 7:06\sPM, after dark\. Lowest: -0\.\d ft on \w{3} \d{1,2}:\d{2}\s[AP]M, (in daylight|after dark)\.$/)
    expect(preset('daylight-low').answer(await ctx())).toMatch(/^Thu 1:01\sPM, at -0\.2 ft\.$/)
    expect(preset('daylight-low').answer(await ctx({ station: { id: 'x' } }))).toMatch(/no location on record/)
  })
})
