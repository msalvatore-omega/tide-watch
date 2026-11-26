// Pure helpers that turn the numbers into meaning: how the height compares with a usual
// tide, how well the gauge has agreed with the predictions, the depth of water at the
// user's own berth, and the "by your rules" lights.
import { heightAt, seriesAt } from './tides.js'

const STEP_MS = 6 * 60e3
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

/** First time after `from` (within `hours`) at which test(predicted height) flips. */
function nextFlip(events, from, hours, test) {
  const start = from.getTime()
  const first = heightAt(events, from)
  if (first == null) return null
  const was = test(first)
  for (let t = start + STEP_MS; t <= start + hours * 3600e3; t += STEP_MS) {
    const h = heightAt(events, new Date(t))
    if (h == null) return null
    if (test(h) !== was) return new Date(t)
  }
  return null
}

/**
 * Water at the user's berth. `charted` is the charted depth there (ft below chart
 * datum; negative for a spot that dries), `draft` the boat's draft (ft).
 * `heightNow` is the present height of tide (observed if there is a gauge).
 */
export function berthNow({ charted, draft }, events, now, heightNow, hours = 48) {
  if (!Number.isFinite(charted) || !Number.isFinite(draft) || heightNow == null) return null
  const depth = charted + heightNow
  const clearance = depth - draft
  const afloat = clearance > 0
  // Predicted change of state, and the least water in the next 24 hours.
  const change = nextFlip(events, now, hours, (h) => charted + h - draft > 0)
  let least = null
  for (let t = now.getTime(); t <= now.getTime() + 24 * 3600e3; t += STEP_MS) {
    const h = heightAt(events, new Date(t))
    if (h == null) break
    if (!least || h < least.height) least = { time: new Date(t), height: h }
  }
  return { depth, clearance, afloat, change, least: least && { time: least.time, depth: charted + least.height, clearance: charted + least.height - draft } }
}

/** Sensible starting rules for a place, from its usual tide (heights in ft). */
export function defaultRules(events) {
  const u = usualRange(events) ?? { high: 2, low: 0 }
  const r1 = (v) => Math.round(v * 10) / 10
  return {
    launch: { min: r1(u.low + (u.high - u.low) * 0.5) }, // enough water: half tide or better
    flats: { max: r1(u.low + (u.high - u.low) * 0.25) }, // flats uncovered: bottom quarter
    turn: { minutes: 60 }, // fishing the turn: within an hour of high or low water
  }
}

export const RULES = [
  { id: 'launch', icon: 'boat', name: 'Launch', describe: (r, ft) => `Height of tide ${ft(r.min)} or more` },
  { id: 'turn', icon: 'fish', name: 'Fish the turn', describe: (r) => `Within ${r.minutes} min of high or low water` },
  { id: 'flats', icon: 'walk', name: 'Walk the flats', describe: (r, ft) => `Height of tide ${ft(r.max)} or less` },
]

/**
 * Is a rule met now, and when does that change?
 * Returns { on, until } while met, or { on: false, next } with the next start.
 */
export function ruleStatus(id, rule, events, now, heightNow) {
  if (id === 'turn') {
    const span = rule.minutes * 60e3
    const near = events.find((e) => e.time.getTime() + span > now.getTime())
    if (!near) return { on: false, next: null }
    const start = new Date(near.time.getTime() - span)
    return now >= start ? { on: true, until: new Date(near.time.getTime() + span), event: near } : { on: false, next: start, event: near }
  }
  const test = id === 'launch' ? (h) => h >= rule.min : (h) => h <= rule.max
  const predicted = heightAt(events, now)
  if (predicted == null) return { on: false, next: null }
  const on = test(heightNow ?? predicted)
  // The change is found from the predictions; if the gauge disagrees with them about
  // "now", look for the next time the predictions leave the state the gauge reports.
  const flip = test(predicted) === on ? nextFlip(events, now, 48, test) : null
  return on ? { on: true, until: flip } : { on: false, next: flip }
}
