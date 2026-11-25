import { describe, it, expect } from 'vitest'
import { sunTimes, isNight, moonPhase } from '../src/astro.js'
import { findWindows } from '../src/components/Planner.jsx'
import { BALTIMORE, EST } from './helpers.js'

const EDT = -4 * 3600e3
const localHM = (d, offset) => new Date(d.getTime() + offset).toISOString().slice(11, 16)
const minutes = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))
const near = (actual, expected, tol = 3) => expect(Math.abs(minutes(actual) - minutes(expected))).toBeLessThanOrEqual(tol)

describe('sunrise and sunset', () => {
  it('matches published times for Baltimore within 3 minutes', () => {
    const nov = sunTimes(new Date('2026-11-25T20:00:00Z'), BALTIMORE.lat, BALTIMORE.lng, EST)
    near(localHM(nov.sunrise, EST), '07:00')
    near(localHM(nov.sunset, EST), '16:46')
    const jun = sunTimes(new Date('2026-06-21T16:00:00Z'), BALTIMORE.lat, BALTIMORE.lng, EDT)
    near(localHM(jun.sunrise, EDT), '05:40')
    near(localHM(jun.sunset, EDT), '20:36')
  })
  it('uses the station-local calendar day, even late in the evening (already tomorrow in UTC)', () => {
    const late = sunTimes(new Date('2026-11-26T04:30:00Z'), BALTIMORE.lat, BALTIMORE.lng, EST) // 11:30 PM on the 25th
    expect(new Date(late.sunrise.getTime() + EST).toISOString().slice(0, 10)).toBe('2026-11-25')
  })
  it('works west of Greenwich and east of it', () => {
    const sf = sunTimes(new Date('2026-11-25T20:00:00Z'), 37.8063, -122.4659, -8 * 3600e3)
    near(localHM(sf.sunrise, -8 * 3600e3), '06:59')
    const sydney = sunTimes(new Date('2026-12-21T02:00:00Z'), -33.8568, 151.2153, 11 * 3600e3)
    near(localHM(sydney.sunrise, 11 * 3600e3), '05:41', 5)
    near(localHM(sydney.sunset, 11 * 3600e3), '20:05', 5)
  })
  it('polar night returns no sunrise instead of NaN', () => {
    const tromso = sunTimes(new Date('2026-12-21T12:00:00Z'), 69.65, 18.96, 3600e3)
    expect(tromso.sunrise).toBeNull()
    expect(isNight(new Date('2026-12-21T12:00:00Z'), 69.65, 18.96, 3600e3)).toBe(false)
  })
  it('isNight flips at sunset', () => {
    expect(isNight(new Date('2026-11-25T20:00:00Z'), BALTIMORE.lat, BALTIMORE.lng, EST)).toBe(false) // 3 PM
    expect(isNight(new Date('2026-11-25T22:30:00Z'), BALTIMORE.lat, BALTIMORE.lng, EST)).toBe(true) // 5:30 PM
    expect(isNight(new Date('2026-11-25T10:00:00Z'), BALTIMORE.lat, BALTIMORE.lng, EST)).toBe(true) // 5 AM
  })
})

describe('moon phase', () => {
  it('full moon of 24 Nov 2026 and new moon of 9 Dec 2026', () => {
    const full = moonPhase(new Date('2026-11-24T15:00:00Z'))
    expect(full.name).toBe('Full moon')
    expect(full.illumination).toBeGreaterThan(0.97)
    expect(full.tides).toBe('spring')
    const neu = moonPhase(new Date('2026-12-09T01:00:00Z'))
    expect(neu.name).toBe('New moon')
    expect(neu.illumination).toBeLessThan(0.03)
    expect(neu.tides).toBe('spring')
  })
  it('quarters bring neap tides; next full/new are in the future', () => {
    const quarter = moonPhase(new Date('2026-12-01T12:00:00Z'))
    expect(quarter.name).toMatch(/Last quarter|Waning/)
    expect(quarter.tides).toBe('neap')
    const now = new Date('2026-11-25T20:00:00Z')
    const m = moonPhase(now)
    expect(m.nextFull.getTime()).toBeGreaterThan(now.getTime())
    expect(m.nextNew.getTime()).toBeGreaterThan(now.getTime())
    expect(m.nextNew.toISOString().slice(0, 10)).toMatch(/2026-12-0[89]/)
  })
})

describe('tide window planner', () => {
  // A simple tide: high 2 ft, low 0 ft, alternating every 6 hours.
  const t0 = Date.UTC(2026, 0, 1)
  const events = Array.from({ length: 9 }, (_, i) => ({ time: new Date(t0 + i * 6 * 3600e3), height: i % 2 ? 0 : 2, type: i % 2 ? 'L' : 'H' }))
  const from = new Date(t0 + 60e3)
  const to = new Date(t0 + 47 * 3600e3)

  it('above the midpoint: one window around each high, about half the cycle long', () => {
    const w = findWindows(events, from, to, 'above', 1)
    expect(w).toHaveLength(5) // highs at 0, 12, 24, 36 and 48 h (first and last cut by the range)
    const middle = w[1]
    expect(middle.peak).toBeCloseTo(2, 2)
    expect((middle.end - middle.start) / 3600e3).toBeCloseTo(6, 0)
    expect((middle.start + middle.end) / 2).toBeCloseTo(t0 + 12 * 3600e3, -6)
  })
  it('below a level reports the lowest point; unreachable levels give nothing', () => {
    const w = findWindows(events, from, to, 'below', 0.5)
    expect(w).toHaveLength(4)
    expect(w[0].peak).toBeCloseTo(0, 2)
    expect((w[0].end - w[0].start) / 3600e3).toBeGreaterThan(3.5)
    expect((w[0].end - w[0].start) / 3600e3).toBeLessThan(4.5)
    expect(findWindows(events, from, to, 'above', 2.5)).toEqual([])
    expect(findWindows(events, from, to, 'below', -1)).toEqual([])
  })
  it('respects an extra filter such as daylight, including for the peak', () => {
    const afternoonOnly = (t) => new Date(t).getUTCHours() >= 13 && new Date(t).getUTCHours() < 20
    const w = findWindows(events, from, to, 'above', 1, afternoonOnly)
    expect(w.length).toBeGreaterThan(0)
    for (const x of w) {
      expect(new Date(x.start).getUTCHours()).toBeGreaterThanOrEqual(13)
      expect(new Date(x.end).getUTCHours()).toBeLessThan(20)
      expect(x.peak).toBeLessThan(2) // the true high (noon/midnight) is outside the allowed hours
    }
  })
})
