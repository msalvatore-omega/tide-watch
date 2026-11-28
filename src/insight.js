// Pure helpers that turn the numbers into meaning: how the height compares with a usual
// tide, and how well the gauge has agreed with the predictions.
import { seriesAt } from './tides.js'

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length

/** Average high water and low water over the loaded predictions (about a month). */
export function usualRange(events) {
  const highs = events.filter((e) => e.type === 'H').map((e) => e.height)
  const lows = events.filter((e) => e.type === 'L').map((e) => e.height)
  if (!highs.length || !lows.length) return null
  return { high: mean(highs), low: mean(lows) }
}

/** Where a height sits against a usual tide here, in plain words. */
export function heightContext(height, events) {
  const u = usualRange(events)
  if (!u || u.high - u.low < 0.05) return null
  const f = (height - u.low) / (u.high - u.low)
  const text =
    f > 1.25 ? 'Well above a usual high water'
    : f > 1.08 ? 'Above a usual high water'
    : f > 0.9 ? 'About a usual high water'
    : f > 0.62 ? 'Upper part of the usual range'
    : f > 0.38 ? 'About half tide'
    : f > 0.1 ? 'Lower part of the usual range'
    : f > -0.08 ? 'About a usual low water'
    : f > -0.25 ? 'Below a usual low water'
    : 'Well below a usual low water'
  return { fraction: f, text, ...u }
}

/**
 * How closely the gauge has followed the predictions over the last `hours`.
 * Returns the average and largest difference (ft), the average signed difference, and
 * a grade: 'close' (within ~0.3 ft), 'fair' (within ~0.75 ft) or 'wide'.
 */
export function agreement(six, now, hours = 24) {
  if (!six?.observed?.length || !six.predicted?.length) return null
  const from = now.getTime() - hours * 3600e3
  const diffs = []
  for (const o of six.observed) {
    if (o.time < from || o.time > now) continue
    const p = seriesAt(six.predicted, o.time.getTime())
    if (p != null) diffs.push(o.height - p)
  }
  if (diffs.length < 20) return null
  const avg = mean(diffs.map(Math.abs))
  const max = Math.max(...diffs.map(Math.abs))
  return { avg, max, bias: mean(diffs), n: diffs.length, grade: avg <= 0.3 ? 'close' : avg <= 0.75 ? 'fair' : 'wide' }
}
