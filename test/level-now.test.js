import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Fresh module state per test (noaa.js memoises requests).
let fetchLevelNow
const NOW = Date.parse('2026-11-28T15:00:00Z')
const rows = (pairs) => ({ data: pairs.map(([t, v]) => ({ t, v: String(v) })) })
const stub = (json) => vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, json: async () => json })))

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ now: NOW })
  ;({ fetchLevelNow } = await import('../src/noaa.js'))
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
})
