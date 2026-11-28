import { describe, it, expect, afterEach } from 'vitest'
import { usualRange, heightContext, agreement } from '../src/insight.js'
import { currentAlerts } from '../src/nws.js'
import { ft, tempText, setMetric, toFeet, fromFeet } from '../src/tides.js'
import { baltimoreEvents, NOW } from './helpers.js'

afterEach(() => setMetric(false))

describe('units', () => {
  it('feet and °F by default; metres and °C on request', () => {
    expect(ft(3.28084)).toBe('3.3 ft')
    expect(tempText(50)).toBe('50°F')
    setMetric(true)
    expect(ft(3.28084)).toBe('1.00 m')
    expect(tempText(50)).toBe('10°C')
    expect(toFeet(1)).toBeCloseTo(3.28084, 4)
    expect(fromFeet(3.28084)).toBe(1)
  })
  it('never prints minus zero', () => {
    expect(ft(-0.04)).toBe('0.0 ft')
    expect(ft(-0.06)).toBe('-0.1 ft')
  })
})

describe('height in context', () => {
  it('compares with the usual high and low water', async () => {
    const events = await baltimoreEvents()
    const u = usualRange(events)
    expect(u.high).toBeGreaterThan(u.low)
    expect(heightContext(u.high, events).text).toBe('About a usual high water')
    expect(heightContext(u.low, events).text).toBe('About a usual low water')
    expect(heightContext((u.high + u.low) / 2, events).text).toBe('About half tide')
    expect(heightContext(u.high + (u.high - u.low), events).text).toBe('Well above a usual high water')
    expect(heightContext(u.low - (u.high - u.low), events).text).toBe('Well below a usual low water')
  })
})

describe('agreement between gauge and predictions', () => {
  const series = (offset) => Array.from({ length: 240 }, (_, i) => ({ time: new Date(NOW.getTime() - (240 - i) * 6 * 60e3), height: Math.sin(i / 20) + offset }))
  it('grades a close match, and reports a steady surge with its sign', () => {
    const close = agreement({ predicted: series(0), observed: series(0.1) }, NOW)
    expect(close.grade).toBe('close')
    expect(close.avg).toBeCloseTo(0.1, 2)
    const wide = agreement({ predicted: series(0), observed: series(-1.2) }, NOW)
    expect(wide.grade).toBe('wide')
    expect(wide.bias).toBeCloseTo(-1.2, 2)
    expect(wide.max).toBeCloseTo(1.2, 2)
  })
  it('says nothing without a gauge or with too few readings', () => {
    expect(agreement({ predicted: series(0), observed: [] }, NOW)).toBeNull()
    expect(agreement({ predicted: series(0), observed: series(0).slice(-5) }, NOW)).toBeNull()
    expect(agreement(null, NOW)).toBeNull()
  })
})

describe('weather service warnings', () => {
  const f = (p) => ({ properties: { id: p.event + (p.ends ?? ''), status: 'Actual', messageType: 'Alert', ...p } })
  const later = new Date(NOW.getTime() + 6 * 3600e3).toISOString()
  const earlier = new Date(NOW.getTime() - 3600e3).toISOString()
  it('drops expired, cancelled and test messages; most severe first; one per kind', () => {
    const out = currentAlerts([
      f({ event: 'Small Craft Advisory', severity: 'Minor', ends: later }),
      f({ event: 'Gale Warning', severity: 'Moderate', ends: later }),
      f({ event: 'Gale Warning', severity: 'Moderate', expires: later, ends: null, description: 'dup' }),
      f({ event: 'Storm Warning', severity: 'Severe', ends: later }),
      f({ event: 'Dense Fog Advisory', severity: 'Minor', ends: earlier }),
      f({ event: 'Coastal Flood Advisory', severity: 'Minor', ends: later, messageType: 'Cancel' }),
      f({ event: 'Hurricane Warning', severity: 'Extreme', ends: later, status: 'Test' }),
    ], NOW)
    expect(out.map((a) => a.event)).toEqual(['Storm Warning', 'Gale Warning', 'Small Craft Advisory'])
  })
  it('uses the expiry when no end time is given', () => {
    expect(currentAlerts([f({ event: 'Gale Warning', severity: 'Moderate', ends: null, expires: earlier })], NOW)).toEqual([])
    expect(currentAlerts(undefined, NOW)).toEqual([])
  })
})
