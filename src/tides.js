// Pure tide helpers: interpolation between highs/lows and display formatting.

/**
 * Estimated water height at time t, using cosine interpolation between the
 * surrounding high and low (the standard "rule of twelfths"-style curve).
 */
export function heightAt(events, t) {
  const i = events.findIndex((e) => e.time > t)
  if (i < 1) return null
  const prev = events[i - 1]
  const next = events[i]
  const frac = (t - prev.time) / (next.time - prev.time)
  return prev.height + (next.height - prev.height) * (1 - Math.cos(Math.PI * frac)) / 2
}

/** Everything the UI needs about "right now". */
export function tideNow(events, now = new Date()) {
  const i = events.findIndex((e) => e.time > now)
  if (i < 1) return null
  const prev = events[i - 1]
  const upcoming = events.slice(i)
  const height = heightAt(events, now)

  // Scale the picture to the tides within a day either side, so a small
  // neap-tide cycle looks smaller than a big spring-tide one.
  const window = events.filter((e) => Math.abs(e.time - now) < 26 * 3600e3)
  const min = Math.min(...window.map((e) => e.height))
  const max = Math.max(...window.map((e) => e.height))
  const fraction = max === min ? 0.5 : (height - min) / (max - min)

  // Station's UTC offset, derived from the paired GMT/local timestamps.
  const offsetMs = offsetAt(events, now)
  const stationClock = new Date(now.getTime() + offsetMs)

  return {
    height,
    rising: upcoming[0].type === 'H',
    fraction: Math.min(1, Math.max(0, fraction)),
    min,
    max,
    prev,
    nextHigh: upcoming.find((e) => e.type === 'H'),
    nextLow: upcoming.find((e) => e.type === 'L'),
    stationHour: stationClock.getUTCHours() + stationClock.getUTCMinutes() / 60,
    offsetMs,
  }
}

/**
 * The station's UTC offset (ms) at time t, read from the nearest high/low tide's
 * paired GMT/local times. Following the nearest tide (rather than one fixed value)
 * keeps times right across daylight-saving changes within the loaded month.
 */
export function offsetAt(events, t) {
  const ms = t instanceof Date ? t.getTime() : t
  let best = events[0]
  for (const e of events) {
    if (Math.abs(e.time - ms) < Math.abs(best.time - ms)) best = e
    else if (e.time > ms) break
  }
  return parseLocal(best.local) - best.time
}

// "YYYY-MM-DD HH:MM" → Date whose UTC fields equal the station's wall-clock time.
function parseLocal(s) {
  const [d, t] = s.split(' ')
  const [Y, M, D] = d.split('-').map(Number)
  const [h, m] = t.split(':').map(Number)
  return new Date(Date.UTC(Y, M - 1, D, h, m))
}

// Clock style. Mariners (and tide tables) use the 24-hour clock, which the app turns
// on at startup; the 12-hour style remains the module default and a user option.
let clock24 = false
export const setClock24 = (on) => { clock24 = Boolean(on) }
export const isClock24 = () => clock24
// In 24-hour style every time shows as HH:MM (e.g. 19:06), including bare-hour labels.
const clockOpts = (opts) => (clock24 && 'hour' in opts ? { ...opts, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : opts)

/** Format a station-local "YYYY-MM-DD HH:MM" string, e.g. "Wed 19:06" (or "Wed 7:06 PM"). */
export function formatStationTime(local, { withDay = true } = {}) {
  return parseLocal(local).toLocaleString([], clockOpts({
    timeZone: 'UTC',
    ...(withDay ? { weekday: 'short' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  }))
}

/** "HW" / "LW": the usual abbreviations for high and low water. */
export const hwlw = (e) => (e.type === 'H' ? 'HW' : 'LW')

const MILES_PER_NM = 1.15078
/** Distance in nautical miles from statute miles, e.g. "6.6 nm". */
export const nmText = (miles) => `${(miles / MILES_PER_NM).toFixed(1)} nm`

const BEAUFORT = [
  [1, 'Calm'], [4, 'Light air'], [7, 'Light breeze'], [11, 'Gentle breeze'], [17, 'Moderate breeze'], [22, 'Fresh breeze'],
  [28, 'Strong breeze'], [34, 'Near gale'], [41, 'Gale'], [48, 'Strong gale'], [56, 'Storm'], [64, 'Violent storm'],
]
/** Beaufort wind force from a speed in knots: { force, name }. */
export function beaufort(knots) {
  const i = BEAUFORT.findIndex(([limit]) => knots < limit)
  return i === -1 ? { force: 12, name: 'Hurricane force' } : { force: i, name: BEAUFORT[i][1] }
}

/** Station wall-clock time for an absolute Date. */
export function formatAtStation(date, offsetMs, opts = { hour: 'numeric', minute: '2-digit' }) {
  return new Date(date.getTime() + offsetMs).toLocaleString([], clockOpts({ timeZone: 'UTC', ...opts }))
}

export function formatCountdown(ms) {
  const mins = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `in ${m}m`
  return `in ${h}h ${m}m`
}

// Height units. Everything is stored and calculated in feet (as NOAA supplies it);
// these helpers turn a value in feet into text in the user's chosen unit.
const M_PER_FT = 0.3048
let metric = false
export const setMetric = (on) => { metric = Boolean(on) }
export const isMetric = () => metric
/** A height with its unit: "1.8 ft" or "0.55 m". */
const noNegZero = (t) => t.replace(/^-(0(\.0+)?)$/, '$1')
export const ft = (v) => `${hNum(v)} ${metric ? 'm' : 'ft'}`
/** The number alone, in the chosen unit: "1.8" or "0.55". */
export const hNum = (v) => noNegZero(metric ? (v * M_PER_FT).toFixed(2) : v.toFixed(1))
export const hUnit = () => (metric ? 'm' : 'ft')
/** A height typed by the user in their unit → feet, and feet → the number to show in an input. */
export const toFeet = (v) => (metric ? v / M_PER_FT : v)
export const fromFeet = (f) => (metric ? Math.round(f * M_PER_FT * 100) / 100 : Math.round(f * 10) / 10)
/** A signed difference: "+1.3 ft" / "−0.40 m". */
export const hDiff = (d) => `${d > 0 ? '+' : '−'}${ft(Math.abs(d))}`
/** A temperature given in °F, in the chosen unit: "62°F" or "17°C". */
export const tempText = (f) => (metric ? `${Math.round(((f - 32) * 5) / 9)}°C` : `${Math.round(f)}°F`)

/** A one-line seaman's read of the state of the tide. */
export function tideMood({ fraction, rising }) {
  if (fraction < 0.15) return 'Near low water: least depth this tide. Mind your under-keel clearance.'
  if (fraction > 0.85) return 'Near high water: about the most depth you will get this tide.'
  return rising ? 'Flood tide making: depths increasing.' : 'Ebb tide running: depths decreasing. Watch the shoals.'
}

/** Linear interpolation in a sorted { time, height } series (e.g. 6-minute data); null outside it. */
export function seriesAt(series, t) {
  const ms = t instanceof Date ? t.getTime() : t
  if (!series?.length || ms < series[0].time.getTime() || ms > series.at(-1).time.getTime()) return null
  const i = series.findIndex((p) => p.time.getTime() >= ms)
  const b = series[i]
  if (b.time.getTime() === ms) return b.height
  const a = series[i - 1]
  return a.height + ((b.height - a.height) * (ms - a.time)) / (b.time - a.time)
}

/** Station-local calendar date ("YYYY-MM-DD") for an absolute time. */
export const stationDate = (date, offsetMs) => new Date(date.getTime() + offsetMs).toISOString().slice(0, 10)

/** "Wed, Nov 25" for a station-local "YYYY-MM-DD". */
export const formatDay = (ymd) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })

export function formatDuration(ms) {
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  return h ? `${h}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`
}
