import { describe, it, expect } from 'vitest'
import { currentNow, speedAt, compass } from '../src/currents.js'

const t0 = Date.UTC(2026, 10, 25, 12)
const at = (h, type, knots = 0) => ({ time: new Date(t0 + h * 3600e3), type, knots, floodDir: 310, ebbDir: 130 })
// slack → max ebb (0.6 kt) → slack → max flood (0.4 kt) → slack
const events = [at(0, 'slack'), at(3, 'ebb', 0.6), at(6, 'slack'), at(9, 'flood', 0.4), at(12, 'slack')]
const now = (h) => new Date(t0 + h * 3600e3)

describe('currents', () => {
  it('compass points', () => {
    expect(compass(0)).toBe('N')
    expect(compass(130)).toBe('SE')
    expect(compass(310)).toBe('NW')
    expect(compass(359)).toBe('N')
    expect(compass(-90)).toBe('W')
    expect(compass(null)).toBe('')
  })
  it('ebb building from slack toward its maximum', () => {
    const c = currentNow(events, now(1.5))
    expect(c.state).toBe('ebb')
    expect(c.building).toBe(true)
    expect(c.dir).toBe(130)
    expect(c.knots).toBeCloseTo(0.6 * Math.sin(Math.PI / 4), 6)
    expect(c.nextSlack.time).toEqual(events[2].time)
    expect(c.nextEbb.time).toEqual(events[1].time)
    expect(c.nextFlood.time).toEqual(events[3].time)
  })
  it('ebb easing after its maximum, then flood', () => {
    const easing = currentNow(events, now(4.5))
    expect(easing.state).toBe('ebb')
    expect(easing.building).toBe(false)
    expect(easing.knots).toBeCloseTo(0.6 * Math.cos(Math.PI / 4), 6)
    const flood = currentNow(events, now(8))
    expect(flood.state).toBe('flood')
    expect(flood.dir).toBe(310)
    expect(flood.nextEbb).toBeNull()
  })
  it('reports slack near the turn and null outside the data', () => {
    expect(currentNow(events, now(5.95)).state).toBe('slack')
    expect(currentNow(events, now(6.05)).state).toBe('slack')
    expect(currentNow(events, now(-1))).toBeNull()
    expect(currentNow(events, now(13))).toBeNull()
    expect(currentNow([], now(1))).toBeNull()
  })
  it('signed speed for charting: flood positive, ebb negative, zero at slack', () => {
    expect(speedAt(events, now(3))).toBeCloseTo(-0.6, 6)
    expect(speedAt(events, now(9))).toBeCloseTo(0.4, 6)
    expect(speedAt(events, now(6))).toBeCloseTo(0, 6)
    expect(speedAt(events, now(20))).toBeNull()
  })
  it('handles stations that go max → max with no slack between (rotary currents)', () => {
    const rotary = [at(0, 'flood', 1.0), at(6, 'ebb', 0.5), at(12, 'flood', 1.0)]
    const c = currentNow(rotary, now(3))
    expect(c.knots).toBeCloseTo(0.75, 6)
    expect(c.state).toBe('flood')
  })
})
