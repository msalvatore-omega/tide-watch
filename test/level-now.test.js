import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Fresh module state per test (noaa.js memoises requests).
let fetchLevelNow, fetchNextTides
const NOW = Date.parse('2026-11-28T15:00:00Z')
const rows = (pairs) => ({ data: pairs.map(([t, v]) => ({ t, v: String(v) })) })
const stub = (json) => vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, json: async () => json })))

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ now: NOW })
  ;({ fetchLevelNow, fetchNextTides } = await import('../src/noaa.js'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('latest gauge reading for the map', () => {
  it('gives the last reading and whether the water is rising', async () => {
    stub(rows([['2026-11-28 14:06', 1.0], ['2026-11-28 14:18', 1.1], ['2026-11-28 14:30', 1.2], ['2026-11-28 14:54', 1.42]]))
    const r = await fetchLevelNow('8574680')
    expect(r.height).toBe(1.42)
    expect(r.time.toISOString()).toBe('2026-11-28T14:54:00.000Z')
    expect(r.trend).toBe('rising')
    expect(fetch.mock.calls[0][0]).toMatch(/product=water_level.*station=8574680.*range=1/)
  })
  it('falling and steady', async () => {
    stub(rows([['2026-11-28 14:12', 2.0], ['2026-11-28 14:30', 1.9], ['2026-11-28 14:54', 1.7]]))
    expect((await fetchLevelNow('1')).trend).toBe('falling')
    stub(rows([['2026-11-28 14:12', 2.0], ['2026-11-28 14:30', 2.01], ['2026-11-28 14:54', 2.02]]))
    expect((await fetchLevelNow('2')).trend).toBe('steady')
  })
  it('nothing when the gauge is silent, has no data, or the copy is old', async () => {
    stub(rows([]))
    expect(await fetchLevelNow('3')).toBeNull()
    stub({ error: { message: 'No data was found.' } })
    expect(await fetchLevelNow('4')).toBeNull()
    stub(rows([['2026-11-28 12:00', 1.0], ['2026-11-28 12:30', 1.1], ['2026-11-28 13:00', 1.2]])) // two hours old
    expect(await fetchLevelNow('5')).toBeNull()
  })
  it('next high and low waters for the pop-up', async () => {
    stub({ predictions: [{ t: '2026-11-28 13:10', v: '0.21', type: 'L' }, { t: '2026-11-28 19:06', v: '1.80', type: 'H' }] })
    const tides = await fetchNextTides('8574680')
    expect(tides).toEqual([
      { type: 'L', time: new Date('2026-11-28T13:10:00Z'), height: 0.21 },
      { type: 'H', time: new Date('2026-11-28T19:06:00Z'), height: 1.8 },
    ])
    expect(fetch.mock.calls[0][0]).toMatch(/product=predictions&interval=hilo.*time_zone=gmt.*range=43/)
  })
  it('says how far the reading stands above or below the prediction', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      status: 200,
      json: async () => (url.includes('product=predictions')
        ? { predictions: [{ t: '2026-11-28 14:48', v: '1.050' }, { t: '2026-11-28 14:54', v: '1.100' }] }
        : rows([['2026-11-28 14:30', 1.5], ['2026-11-28 14:42', 1.6], ['2026-11-28 14:54', 1.72]])),
    })))
    const r = await fetchLevelNow('8574680')
    expect(r.diff).toBeCloseTo(0.62, 5)
    expect(r.trend).toBe('rising')
  })
  it('still gives the reading when the prediction cannot be had', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('product=predictions')) throw new Error('network')
      return { status: 200, json: async () => rows([['2026-11-28 14:30', 1.5], ['2026-11-28 14:42', 1.5], ['2026-11-28 14:54', 1.5]]) }
    }))
    const r = await fetchLevelNow('8574680')
    expect(r.height).toBe(1.5)
    expect(r.diff).toBeNull()
  })
})

describe('a favorite station at a glance', () => {
  it('uses the gauge where there is one', async () => {
    stub(rows([['2026-11-28 14:12', 2.0], ['2026-11-28 14:30', 1.9], ['2026-11-28 14:54', 1.7]]))
    const { stationGlance } = await import('../src/live.js')
    expect(await stationGlance('1', new Date(NOW))).toEqual({ height: 1.7, trend: 'falling', observed: true })
  })
  it('falls back to the predicted height between high and low water', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      status: 200,
      json: async () => (url.includes('interval=hilo')
        ? { predictions: [{ t: '2026-11-28 12:00', v: '0.0', type: 'L' }, { t: '2026-11-28 18:00', v: '2.0', type: 'H' }] }
        : { error: { message: 'No data was found.' } }),
    })))
    const { stationGlance } = await import('../src/live.js')
    const g = await stationGlance('2', new Date(NOW)) // half way from low to high water
    expect(g.observed).toBe(false)
    expect(g.trend).toBe('rising')
    expect(g.height).toBeCloseTo(1.0, 5)
  })
})
