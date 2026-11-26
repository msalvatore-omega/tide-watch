import { describe, it, expect, afterEach, vi } from 'vitest'
import { swingsFrom, swingStats, findAlerts, alertsToICS } from '../src/alerts.js'
import { liveNow, isSurge, diffText, liveMood } from '../src/surge.js'
import { baltimoreEvents, NOW } from './helpers.js'

afterEach(() => vi.unstubAllGlobals())

describe('big-swing alerts', () => {
  it('a swing is the change between consecutive highs and lows', async () => {
    const events = await baltimoreEvents()
    const swings = swingsFrom(events)
    expect(swings).toHaveLength(events.length - 1)
    expect(swings[0].size).toBeCloseTo(Math.abs(events[1].height - events[0].height), 9)
    expect(swings[0].rising).toBe(events[1].type === 'H')
  })
  it('auto mode flags roughly the biggest 10% for the station', async () => {
    const events = await baltimoreEvents()
    const stats = swingStats(swingsFrom(events))
    expect(stats.typical).toBeGreaterThan(0.8)
    expect(stats.typical).toBeLessThan(1.3)
    expect(stats.big).toBeGreaterThan(stats.typical)
    const { alerts, threshold } = findAlerts(events, NOW, { mode: 'auto' })
    expect(threshold).toBe(stats.big)
    expect(alerts.length).toBeGreaterThan(0)
    for (const a of alerts) {
      expect(a.size).toBeGreaterThanOrEqual(threshold)
      expect(a.to.time.getTime()).toBeGreaterThan(NOW.getTime())
      expect(a.from.time.getTime()).toBeLessThan(NOW.getTime() + 7 * 86400e3)
      expect(a.inProgress).toBe(a.from.time <= NOW)
    }
    // 2026-11-25: the 12:03 PM low → 7:06 PM high (1.98 ft) is under way at 3 PM
    expect(alerts[0].inProgress).toBe(true)
    expect(alerts[0].size).toBeCloseTo(1.982, 3)
  })
  it('custom mode uses the chosen size; a huge size finds nothing', async () => {
    const events = await baltimoreEvents()
    expect(findAlerts(events, NOW, { mode: 'custom', feet: 1 }).alerts.length).toBeGreaterThan(findAlerts(events, NOW, { mode: 'auto' }).alerts.length)
    expect(findAlerts(events, NOW, { mode: 'custom', feet: 50 }).alerts).toEqual([])
  })
  it('calendar export has one event with a reminder per alert', async () => {
    const { alerts } = findAlerts(await baltimoreEvents(), NOW, { mode: 'auto' })
    const ics = alertsToICS(alerts, 'Baltimore, MD')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(alerts.length)
    expect(ics.match(/TRIGGER:-PT120M/g)).toHaveLength(alerts.length)
    expect(ics).toContain('Baltimore\\, MD') // commas escaped per the iCalendar format
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(ics).toMatch(/SUMMARY:Large tidal range: rise of 2\.0 ft/)
    expect(ics).toMatch(/LW -0\.2 ft → HW 1\.8 ft\. About 1\.9× the usual range here\./)
  })
})

describe('live reading vs forecast', () => {
  const at = (min, height) => ({ time: new Date(NOW.getTime() + min * 60e3), height })
  const predicted = [at(-60, 1.0), at(-30, 1.2), at(0, 1.4), at(30, 1.6)]
  it('reports the gap to the forecast and the trend over ~30 minutes', () => {
    const r = liveNow({ observed: [at(-48, 1.5), at(-12, 1.9)], predicted }, NOW)
    expect(r.height).toBe(1.9)
    expect(r.predicted).toBeCloseTo(1.32, 6) // interpolated at -12 min
    expect(r.diff).toBeCloseTo(0.58, 6)
    expect(r.trend).toBe('rising')
    expect(r.ageMs).toBe(12 * 60e3)
  })
  it('trend is falling / steady / unknown as appropriate', () => {
    expect(liveNow({ observed: [at(-40, 2), at(-6, 1.5)], predicted }, NOW).trend).toBe('falling')
    expect(liveNow({ observed: [at(-40, 1.5), at(-6, 1.51)], predicted }, NOW).trend).toBe('steady')
    expect(liveNow({ observed: [at(-6, 1.5)], predicted }, NOW).trend).toBeNull()
  })
  it('handles no readings and no matching forecast', () => {
    expect(liveNow({ observed: [], predicted }, NOW)).toBeNull()
    const r = liveNow({ observed: [at(-6, 1.5)], predicted: [] }, NOW)
    expect(r.diff).toBeNull()
    expect(r.predicted).toBeNull()
  })
  it('surge threshold, wording and mood', () => {
    expect(isSurge({ diff: 1.0 }, 1)).toBe(true)
    expect(isSurge({ diff: -1.2 }, 1)).toBe(true)
    expect(isSurge({ diff: 0.99 }, 1)).toBe(false)
    expect(isSurge({ diff: 5 }, null)).toBe(false) // warnings off
    expect(isSurge({ diff: null }, 1)).toBe(false)
    expect(isSurge(null, 1)).toBe(false)
    expect(diffText(0.31)).toBe('0.3 ft above predicted')
    expect(diffText(-1.26)).toBe('1.3 ft below predicted')
    expect(diffText(0.02)).toBe('on prediction')
    expect(liveMood({ diff: 1.5 }, 'fallback', 1)).toMatch(/above prediction: wind set-up or storm surge/)
    expect(liveMood({ diff: -1.5 }, 'fallback', 1)).toMatch(/below prediction: offshore wind/)
    expect(liveMood({ diff: 0.2 }, 'fallback', 1)).toBe('fallback')
  })
})
