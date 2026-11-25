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
  const offsetMs = parseLocal(prev.local) - prev.time
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

// "YYYY-MM-DD HH:MM" → Date whose UTC fields equal the station's wall-clock time.
function parseLocal(s) {
  const [d, t] = s.split(' ')
  const [Y, M, D] = d.split('-').map(Number)
  const [h, m] = t.split(':').map(Number)
  return new Date(Date.UTC(Y, M - 1, D, h, m))
}

/** Format a station-local "YYYY-MM-DD HH:MM" string, e.g. "Wed 5:52 PM". */
export function formatStationTime(local, { withDay = true } = {}) {
  return parseLocal(local).toLocaleString([], {
    timeZone: 'UTC',
    ...(withDay ? { weekday: 'short' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Station wall-clock time for an absolute Date. */
export function formatAtStation(date, offsetMs, opts = { hour: 'numeric', minute: '2-digit' }) {
  return new Date(date.getTime() + offsetMs).toLocaleString([], { timeZone: 'UTC', ...opts })
}

export function formatCountdown(ms) {
  const mins = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `in ${m}m`
  return `in ${h}h ${m}m`
}

export const ft = (v) => `${v.toFixed(1)} ft`

/** A fun one-liner for the current state of the tide. */
export function tideMood({ fraction, rising }) {
  if (fraction < 0.15) return 'Low tide: go explore the tide pools! 🐚'
  if (fraction > 0.85) return 'High tide: the beach is at its smallest. 🏄'
  return rising ? 'Water is rising. Move your towel! 🏖️' : 'Water is falling. More beach is on the way. 🦀'
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
