import { describe, it, expect, afterEach, vi } from 'vitest'
import { heightAt, tideNow, seriesAt, stationDate, formatDay, formatCountdown, formatDuration, formatStationTime, tideMood } from '../src/tides.js'
import { baltimoreEvents, NOW, EST } from './helpers.js'

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
  it('mood lines', () => {
    expect(tideMood({ fraction: 0.05, rising: false })).toMatch(/Low tide/)
    expect(tideMood({ fraction: 0.95, rising: true })).toMatch(/High tide/)
    expect(tideMood({ fraction: 0.5, rising: true })).toMatch(/rising/)
    expect(tideMood({ fraction: 0.5, rising: false })).toMatch(/falling/)
  })
})
