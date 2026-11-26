// Pure surge/live-reading helpers, shared by the web app and the alerts server.
import { ft } from './tides.js'

export const DEFAULT_SURGE_FT = 1.0 // flag water this far above/below the prediction
export const SURGE_CHOICES = [0.5, 0.75, 1, 1.5, 2, 3]

/** True when a live reading is at least `surgeFeet` off the forecast (null = warnings off). */
export const isSurge = (reading, surgeFeet) =>
  surgeFeet != null && reading?.diff != null && Math.abs(reading.diff) >= surgeFeet

// Linear interpolation over a time series of { time, height }.
function valueAt(series, t) {
  const i = series.findIndex((p) => p.time >= t)
  if (i === -1) return null
  if (i === 0) return series[0].time.getTime() === t.getTime() ? series[0].height : null
  const a = series[i - 1]
  const b = series[i]
  return a.height + ((b.height - a.height) * (t - a.time)) / (b.time - a.time)
}

/** Latest reading, how it compares with the prediction, and which way it's moving. */
export function liveNow({ observed, predicted }, now) {
  const latest = observed.at(-1)
  if (!latest) return null
  const predictedThen = valueAt(predicted, latest.time)
  // Compare with the reading ~30 minutes earlier to smooth out wave chop.
  const earlier = observed.findLast((o) => latest.time - o.time >= 30 * 60e3)
  const delta = earlier ? latest.height - earlier.height : null
  const trend = delta == null ? null : delta > 0.03 ? 'rising' : delta < -0.03 ? 'falling' : 'steady'
  return {
    height: latest.height,
    time: latest.time,
    ageMs: now - latest.time,
    predicted: predictedThen,
    diff: predictedThen == null ? null : latest.height - predictedThen,
    trend,
  }
}

export function diffText(diff) {
  if (diff == null) return ''
  if (Math.abs(diff) < 0.05) return 'on prediction'
  return `${ft(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} predicted`
}

export function liveMood(live, fallbackMood, surgeFeet) {
  if (!isSurge(live, surgeFeet)) return fallbackMood
  return live.diff > 0
    ? 'Running well above prediction: wind set-up or storm surge.'
    : 'Running well below prediction: offshore wind is blowing the water out.'
}
