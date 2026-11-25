import { describe, it, expect, afterEach, vi } from 'vitest'
import { heightAt, tideNow, seriesAt, offsetAt, stationDate, formatDay, formatCountdown, formatDuration, formatStationTime, formatAtStation, tideMood, setClock24, nmText, beaufort, hwlw } from '../src/tides.js'
import { baltimoreEvents, mockFetch, NOW, EST } from './helpers.js'

afterEach(() => vi.unstubAllGlobals())

describe('fetchHiLo pairing (GMT list ↔ station-local list)', () => {
  it('pairs each tide with its own local time even though the two lists start at different instants', async () => {
    const events = await baltimoreEvents()
    expect(events.length).toBeGreaterThan(100)
    for (const e of events) {
      // local wall-clock = absolute time shifted by the station offset (EST here, no DST change in range)
      const asLocal = new Date(e.time.getTime() + EST).toISOString().slice(0, 16).replace('T', ' ')
      expect(e.local).toBe(asLocal)
    }
    // NOAA's published Baltimore tides for 2026-11-25
    const day = events.filter((e) => e.local.startsWith('2026-11-25')).map((e) => [e.local.slice(11), e.type, e.height])
    expect(day).toEqual([['01:36', 'L', 0.188], ['06:10', 'H', 0.873], ['12:03', 'L', -0.216], ['19:06', 'H', 1.766]])
  })
})

describe('fetchHiLo pairing: edge cases', () => {
  // A UTC-8 station: the local list starts 8 hours later than the GMT list.
  const tide = (i, v) => ({ gmt: new Date(Date.UTC(2026, 10, 24, 1, 12) + i * 6.2 * 3600e3), type: i % 2 ? 'L' : 'H', v })
  const fmt = (d) => d.toISOString().slice(0, 16).replace('T', ' ')
  const serve = async (tides, offsetH = -8) => {
    mockFetch((u) => ({
      predictions: tides
        .filter((t) => (u.searchParams.get('time_zone') === 'gmt' ? true : t.gmt.getTime() + offsetH * 3600e3 >= Date.UTC(2026, 10, 24)))
        .map((t) => ({ t: fmt(u.searchParams.get('time_zone') === 'gmt' ? t.gmt : new Date(t.gmt.getTime() + offsetH * 3600e3)), v: t.v, type: t.type })),
    }))
    const { fetchHiLo } = await import('../src/noaa.js')
    return fetchHiLo('9414290')
  }
  it('two consecutive highs with identical heights each keep their own local time', async () => {
    const tides = ['5.200', '1.000', '5.200', '0.900', '5.200', '1.100', '4.800', '0.700'].map((v, i) => tide(i, v))
    const events = await serve(tides)
    expect(events.length).toBe(tides.length - 2) // the first two GMT tides fall before the local list starts
    for (const e of events) expect(e.local).toBe(fmt(new Date(e.time.getTime() - 8 * 3600e3)))
  })
  it('throws a clear error when nothing lines up', async () => {
    mockFetch((u) => ({ predictions: u.searchParams.get('time_zone') === 'gmt' ? [{ t: '2026-11-24 01:00', v: '1.0', type: 'H' }] : [] }))
    const { fetchHiLo } = await import('../src/noaa.js')
    await expect(fetchHiLo('x')).rejects.toThrow(/No tide predictions/)
  })
})

describe('offsetAt (station UTC offset follows daylight-saving changes)', () => {
  // Clocks go back on 1 Nov 2026 at 06:00 UTC: EDT (-4) before, EST (-5) after.
  const ev = (iso, local) => ({ time: new Date(iso), local, height: 1, type: 'H' })
  const events = [
    ev('2026-10-31T20:00:00Z', '2026-10-31 16:00'),
    ev('2026-11-01T02:00:00Z', '2026-10-31 22:00'),
    ev('2026-11-01T08:30:00Z', '2026-11-01 03:30'),
    ev('2026-11-01T14:30:00Z', '2026-11-01 09:30'),
  ]
  it('uses the nearest tide, so times after the change get the new offset', () => {
    expect(offsetAt(events, new Date('2026-10-31T21:00:00Z')) / 3600e3).toBe(-4)
    expect(offsetAt(events, new Date('2026-11-01T12:00:00Z')) / 3600e3).toBe(-5)
    expect(offsetAt(events, Date.parse('2026-11-02T00:00:00Z')) / 3600e3).toBe(-5) // beyond the last tide
    expect(offsetAt(events, Date.parse('2026-10-01T00:00:00Z')) / 3600e3).toBe(-4) // before the first
  })
})

describe('heightAt (cosine interpolation between highs and lows)', () => {
  it('equals the tabulated height at each high/low and the midpoint halfway between', async () => {
    const events = await baltimoreEvents()
    const [a, b] = [events[5], events[6]]
    expect(heightAt(events, new Date(a.time.getTime() + 1))).toBeCloseTo(a.height, 3)
    expect(heightAt(events, new Date((a.time.getTime() + b.time.getTime()) / 2))).toBeCloseTo((a.height + b.height) / 2, 6)
    expect(heightAt(events, b.time)).toBeCloseTo(b.height, 6)
  })
  it('stays between the two surrounding extremes', async () => {
    const events = await baltimoreEvents()
    for (let t = events[2].time.getTime(); t < events[10].time.getTime(); t += 17 * 60e3) {
      const i = events.findIndex((e) => e.time > t)
      const [lo, hi] = [events[i - 1].height, events[i].height].sort((x, y) => x - y)
      const h = heightAt(events, new Date(t))
      expect(h).toBeGreaterThanOrEqual(lo - 1e-9)
      expect(h).toBeLessThanOrEqual(hi + 1e-9)
    }
  })
  it('returns null outside the loaded predictions', async () => {
    const events = await baltimoreEvents()
    expect(heightAt(events, new Date(events[0].time.getTime() - 1))).toBeNull()
    expect(heightAt(events, new Date(events.at(-1).time.getTime() + 1))).toBeNull()
  })
})

describe('tideNow', () => {
  it('finds the next high and low, direction, and the station offset', async () => {
    const tide = tideNow(await baltimoreEvents(), NOW)
    expect(tide.offsetMs).toBe(EST)
    expect(tide.stationHour).toBeCloseTo(15, 5)
    expect(tide.rising).toBe(true)
    expect(tide.nextHigh.local).toBe('2026-11-25 19:06')
    expect(tide.nextLow.local).toBe('2026-11-26 02:30')
    expect(tide.fraction).toBeGreaterThan(0)
    expect(tide.fraction).toBeLessThan(1)
    expect(tide.min).toBeLessThanOrEqual(tide.height)
    expect(tide.max).toBeGreaterThanOrEqual(tide.height)
  })
  it('returns null when now is outside the data', async () => {
    const events = await baltimoreEvents()
    expect(tideNow(events, new Date('2020-01-01'))).toBeNull()
    expect(tideNow(events, new Date('2030-01-01'))).toBeNull()
  })
})

describe('seriesAt', () => {
  const series = [0, 6, 12].map((m, i) => ({ time: new Date(Date.UTC(2026, 0, 1, 0, m)), height: i * 2 }))
  it('interpolates linearly and returns exact points', () => {
    expect(seriesAt(series, new Date(Date.UTC(2026, 0, 1, 0, 3)))).toBeCloseTo(1)
    expect(seriesAt(series, series[1].time)).toBe(2)
    expect(seriesAt(series, series[0].time)).toBe(0)
    expect(seriesAt(series, series[2].time.getTime())).toBe(4)
  })
  it('returns null outside the series or with no data', () => {
    expect(seriesAt(series, new Date(Date.UTC(2026, 0, 1, 0, 13)))).toBeNull()
    expect(seriesAt([], new Date())).toBeNull()
    expect(seriesAt(undefined, new Date())).toBeNull()
  })
})

describe('formatting', () => {
  it('station dates roll over at the station\'s midnight, not UTC', () => {
    expect(stationDate(new Date('2026-11-26T04:59:00Z'), EST)).toBe('2026-11-25')
    expect(stationDate(new Date('2026-11-26T05:00:00Z'), EST)).toBe('2026-11-26')
    expect(formatDay('2026-11-25')).toMatch(/Wed.*Nov.*25/)
  })
  it('countdowns and durations', () => {
    expect(formatCountdown(25 * 60e3)).toBe('in 25m')
    expect(formatCountdown(3 * 3600e3 + 5 * 60e3)).toBe('in 3h 5m')
    expect(formatCountdown(-5000)).toBe('in 0m')
    expect(formatDuration(45 * 60e3)).toBe('45m')
    expect(formatDuration(3 * 3600e3 + 6 * 60e3)).toBe('3h 06m')
  })
  it('station-local times do not depend on the viewer\'s time zone', () => {
    expect(formatStationTime('2026-11-25 19:06', { withDay: false })).toMatch(/^7:06\sPM$/)
    expect(formatStationTime('2026-11-25 19:06')).toMatch(/Wed/)
  })
  it('state-of-tide lines use seamen\'s terms', () => {
    expect(tideMood({ fraction: 0.05, rising: false })).toMatch(/^Near low water/)
    expect(tideMood({ fraction: 0.95, rising: true })).toMatch(/^Near high water/)
    expect(tideMood({ fraction: 0.5, rising: true })).toMatch(/^Flood tide/)
    expect(tideMood({ fraction: 0.5, rising: false })).toMatch(/^Ebb tide/)
  })
  it('24-hour clock: HH:MM everywhere, including bare-hour labels and midnight', () => {
    setClock24(true)
    try {
      expect(formatStationTime('2026-11-25 19:06', { withDay: false })).toBe('19:06')
      expect(formatStationTime('2026-11-26 02:30')).toMatch(/^Thu,? 02:30$/)
      expect(formatAtStation(new Date('2026-11-25T23:00:00Z'), EST, { hour: 'numeric' })).toBe('18:00')
      expect(formatAtStation(new Date('2026-11-25T05:00:00Z'), EST)).toBe('00:00') // midnight is 00:00, never 24:00
    } finally {
      setClock24(false)
    }
    expect(formatStationTime('2026-11-25 19:06', { withDay: false })).toMatch(/^7:06\sPM$/)
  })
  it('nautical units: nautical miles, Beaufort force, HW/LW', () => {
    expect(nmText(7.6)).toBe('6.6 nm')
    expect(nmText(1.15078)).toBe('1.0 nm')
    expect(beaufort(0.5)).toEqual({ force: 0, name: 'Calm' })
    expect(beaufort(10)).toEqual({ force: 3, name: 'Gentle breeze' })
    expect(beaufort(11)).toEqual({ force: 4, name: 'Moderate breeze' })
    expect(beaufort(34)).toEqual({ force: 8, name: 'Gale' })
    expect(beaufort(70)).toEqual({ force: 12, name: 'Hurricane force' })
    expect(hwlw({ type: 'H' })).toBe('HW')
    expect(hwlw({ type: 'L' })).toBe('LW')
  })
})
