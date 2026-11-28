import { describe, it, expect } from 'vitest'
import { sunTimes, isNight, moonPhase, moonTimes, nextMoonEvent } from '../src/astro.js'
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
  it('polar night is night all day; midnight sun is day all night', () => {
    const winter = sunTimes(new Date('2026-12-21T12:00:00Z'), 69.65, 18.96, 3600e3) // Tromsø
    expect(winter.sunrise).toBeNull()
    expect(winter.polar).toBe('night')
    expect(isNight(new Date('2026-12-21T12:00:00Z'), 69.65, 18.96, 3600e3)).toBe(true)
    const summer = sunTimes(new Date('2026-06-21T23:00:00Z'), 69.65, 18.96, 2 * 3600e3)
    expect(summer.polar).toBe('day')
    expect(isNight(new Date('2026-06-21T23:00:00Z'), 69.65, 18.96, 2 * 3600e3)).toBe(false)
  })
  it('a sunset after local midnight still counts as daylight until it sets (Nome, June)', () => {
    const AKDT = -8 * 3600e3
    const t = (hm) => new Date(`2026-06-21T${hm}:00Z`) // 08:30Z = 12:30 AM local, 12:00Z = 4:00 AM local
    expect(isNight(t('08:30'), 64.5, -165.4, AKDT)).toBe(false) // sun sets around 1:45 AM
    expect(isNight(t('11:00'), 64.5, -165.4, AKDT)).toBe(true) // 3 AM: between sunset and the ~4:20 AM sunrise
    expect(isNight(t('14:00'), 64.5, -165.4, AKDT)).toBe(false) // 6 AM
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

describe('moonrise and moonset', () => {
  const hm = (d, off) => new Date(d.getTime() + off).toISOString().slice(11, 16)
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  const near = (got, want) => expect(Math.abs(mins(got) - mins(want))).toBeLessThanOrEqual(4)
  // Reference times from a full ephemeris (astronomy-engine), station-local.
  it('matches an ephemeris within a few minutes', () => {
    for (const [day, rise, set] of [['2026-11-26', '18:42', '09:33'], ['2026-12-03', '01:52', '13:26'], ['2026-12-09', '08:03', '16:58'], ['2026-12-17', '12:09', '00:01']]) {
      const m = moonTimes(new Date(`${day}T17:00:00Z`), BALTIMORE.lat, BALTIMORE.lng, EST)
      near(hm(m.rise, EST), rise)
      near(hm(m.set, EST), set)
    }
    const sf = moonTimes(new Date('2026-11-26T20:00:00Z'), 37.8063, -122.4659, -8 * 3600e3)
    near(hm(sf.rise, -8 * 3600e3), '19:00')
    near(hm(sf.set, -8 * 3600e3), '09:39')
  })
  it('some days have no moonrise or no moonset, and the times stay inside the day', () => {
    let missing = 0
    for (let i = 0; i < 30; i++) {
      const noon = new Date(Date.parse('2026-11-26T17:00:00Z') + i * 86400e3)
      const m = moonTimes(noon, BALTIMORE.lat, BALTIMORE.lng, EST)
      if (!m.rise || !m.set) missing++
      for (const t of [m.rise, m.set]) if (t) expect(Math.abs(t - noon)).toBeLessThanOrEqual(12 * 3600e3)
    }
    expect(missing).toBeGreaterThanOrEqual(1)
    expect(missing).toBeLessThanOrEqual(3)
  })
  it('knows whether the moon is up, and what comes next', () => {
    const evening = new Date('2026-11-27T02:00:00Z') // 21:00 on the 26th, after moonrise
    expect(moonTimes(evening, BALTIMORE.lat, BALTIMORE.lng, EST).up).toBe(true)
    const next = nextMoonEvent(evening, BALTIMORE.lat, BALTIMORE.lng, EST)
    expect(next.type).toBe('set')
    near(hm(next.time, EST), '10:28')
    const noon = new Date('2026-11-26T17:00:00Z')
    expect(moonTimes(noon, BALTIMORE.lat, BALTIMORE.lng, EST).up).toBe(false)
    expect(nextMoonEvent(noon, BALTIMORE.lat, BALTIMORE.lng, EST).type).toBe('rise')
  })
})
