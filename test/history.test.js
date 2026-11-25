import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mockFetch, noData } from './helpers.js'

// Fresh module state per test (noaa.js memoises requests).
let lastBeyond, records, floodStage, fetchFloodLevels, calls
const TODAY = new Date('2026-11-25T05:00:00Z') // station-local midnight (EST)

const MONTHS = [
  { year: '1908', month: '1', highest: '2.0', lowest: '-5.105' },
  { year: '2003', month: '9', highest: '8.148', lowest: '-0.4' },
  { year: '2025', month: '10', highest: '4.439', lowest: '-0.9' },
  { year: '2026', month: '9', highest: '3.064', lowest: '0.325' },
  { year: '2026', month: '10', highest: '3.294', lowest: '-0.994' }, // last verified month
]
const HILO = {
  '20251001': [{ t: '2025-10-30 17:12', v: '4.439', ty: 'HH' }, { t: '2025-10-31 05:54', v: '3.366', ty: 'HH' }, { t: '2025-10-31 12:00', v: '0.5', ty: 'L ' }],
  '20030901': [{ t: '2003-09-19 12:06', v: '8.148', ty: 'HH' }, { t: '2003-09-20 01:00', v: '3.0', ty: 'H ' }],
}
const RECENT = [ // unverified 6-minute readings since 1 Nov 2026
  { t: '2026-11-10 14:00', v: '2.60' }, { t: '2026-11-10 14:06', v: '2.71' }, { t: '2026-11-10 20:00', v: '-0.80' },
  { t: '2026-11-20 09:00', v: '1.90' }, { t: '2026-11-20 15:00', v: '0.10' },
]

beforeEach(async () => {
  vi.resetModules()
  calls = mockFetch((u) => {
    const p = u.searchParams
    if (u.pathname.endsWith('/datums.json')) return { datums: [{ name: 'MLLW', value: 4.11 }, { name: 'MSL', value: 4.9 }, { name: 'MHHW', value: 5.76 }] }
    if (u.pathname.endsWith('/floodlevels.json')) return { nos_minor: 7.47, nos_moderate: 8.44, nos_major: 9.67, nws_minor: 7.5 }
    if (p.get('product') === 'monthly_mean') return { data: MONTHS }
    if (p.get('product') === 'high_low') return HILO[p.get('begin_date')] ? { data: HILO[p.get('begin_date')] } : noData()
    if (p.get('product') === 'hourly_height') return p.get('begin_date') === '19080101' ? { data: [{ t: '1908-01-24 21:00', v: '-5.004' }, { t: '1908-01-25 03:00', v: '-2.0' }] } : noData()
    if (p.get('product') === 'water_level') return { data: RECENT }
    throw new Error(`unexpected ${u}`)
  })
  ;({ lastBeyond, records, floodStage } = await import('../src/history.js'))
  ;({ fetchFloodLevels } = await import('../src/noaa.js'))
})
afterEach(() => vi.unstubAllGlobals())

const iso = (r) => r.time.toISOString().slice(0, 16)

describe('"last time the water was this high / low"', () => {
  it('1. answers from already-loaded readings when yesterday qualifies (no extra requests)', async () => {
    const observed = [
      { time: new Date('2026-11-24T23:00:00Z'), height: 1.5 }, // yesterday evening
      { time: new Date('2026-11-25T15:00:00Z'), height: 1.6 }, // today: must be ignored
    ]
    const r = await lastBeyond('8574680', 1.4, 'high', { before: TODAY, observed })
    expect(iso(r)).toBe('2026-11-24T23:00')
    expect(calls).toHaveLength(0)
  })
  it('2. then searches the unverified recent weeks (daily max / min)', async () => {
    const high = await lastBeyond('8574680', 2.5, 'high', { before: TODAY, observed: [] })
    expect(iso(high)).toBe('2026-11-10T14:06')
    expect(high.height).toBe(2.71)
    const low = await lastBeyond('8574680', -0.5, 'low', { before: TODAY, observed: [] })
    expect(iso(low)).toBe('2026-11-10T20:00')
  })
  it('3. then the monthly records, pinning the exact tide within the month', async () => {
    const r = await lastBeyond('8574680', 3.36, 'high', { before: TODAY, observed: [] })
    expect(iso(r)).toBe('2025-10-31T05:54') // the later of the two qualifying highs that month
    expect(r.height).toBe(3.366)
    const big = await lastBeyond('8574680', 4.0, 'high', { before: TODAY, observed: [] })
    expect(iso(big)).toBe('2025-10-30T17:12')
  })
  it('falls back to hourly readings for old records with no high/low table (1908)', async () => {
    const r = await lastBeyond('8574680', -5.0, 'low', { before: TODAY, observed: [] })
    expect(iso(r)).toBe('1908-01-24T21:00')
  })
  it('gives the month when no detail exists, and null when it has never happened', async () => {
    const r = await lastBeyond('8574680', 3.2, 'high', { before: TODAY, observed: [] })
    expect(r.monthOnly).toBe(true) // Oct 2026: verified monthly figure, but no high/low detail in this mock
    expect(r.time.toISOString().slice(0, 7)).toBe('2026-10')
    expect(await lastBeyond('8574680', 9, 'high', { before: TODAY, observed: [] })).toBeNull()
    expect(await lastBeyond('8574680', -6, 'low', { before: TODAY, observed: [] })).toBeNull()
  })
})

describe('records and flood levels', () => {
  it('all-time high and low with their dates', async () => {
    const rec = await records('8574680')
    expect(rec.since).toBe(1908)
    expect(rec.high.height).toBe(8.148)
    expect(iso(rec.high)).toBe('2003-09-19T12:06')
    expect(rec.low.height).toBe(-5.105) // monthly figure kept; hourly data pins the day
    expect(iso(rec.low)).toBe('1908-01-24T21:00')
  })
  it('converts NOAA flood levels from the station datum to feet above MLLW', async () => {
    const flood = await fetchFloodLevels('8574680')
    expect(flood).toEqual({ minor: 3.36, moderate: 4.33, major: 5.56 })
    expect(floodStage(3.3, flood)).toBeNull()
    expect(floodStage(3.36, flood)).toBe('minor')
    expect(floodStage(4.5, flood)).toBe('moderate')
    expect(floodStage(8.1, flood)).toBe('major')
    expect(floodStage(8.1, null)).toBeNull()
  })
})
