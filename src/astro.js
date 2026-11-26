// Sunrise/sunset and moon phase, computed on the device (no API needed).
// Sun: the standard "sunrise equation" (accurate to about a minute).
// Moon: mean synodic month from a reference new moon (accurate to about half a day).

const rad = Math.PI / 180
const DAY_MS = 86400000
const J2000 = 2451545.0
const toJulian = (ms) => ms / DAY_MS + 2440587.5
const fromJulian = (j) => new Date((j - 2440587.5) * DAY_MS)

/**
 * Sunrise and sunset for the station-local calendar day containing `date`.
 * offsetMs = station's UTC offset (from the tide data). Returns Dates; in polar
 * day/night sunrise and sunset are null and `polar` says which ('day' | 'night').
 */
export function sunTimes(date, lat, lng, offsetMs) {
  const local = new Date(date.getTime() + offsetMs)
  const localNoonUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12) - offsetMs
  const n = Math.round(toJulian(localNoonUtc) - J2000 + lng / 360)
  const jStar = n - lng / 360
  const M = (357.5291 + 0.98560028 * jStar) % 360
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad)
  const lambda = (M + C + 180 + 102.9372) % 360
  const jTransit = J2000 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad)
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad)
  const cosDec = Math.cos(Math.asin(sinDec))
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec)
  // cosH > 1: the sun never rises that day (polar night); cosH < -1: it never sets.
  if (cosH > 1 || cosH < -1) return { sunrise: null, sunset: null, noon: fromJulian(jTransit), polar: cosH > 1 ? 'night' : 'day' }
  const H = Math.acos(cosH) / rad
  return { sunrise: fromJulian(jTransit - H / 360), sunset: fromJulian(jTransit + H / 360), noon: fromJulian(jTransit) }
}

export function isNight(date, lat, lng, offsetMs) {
  const { sunrise, sunset, polar } = sunTimes(date, lat, lng, offsetMs)
  if (polar) return polar === 'night'
  if (date > sunset) return true
  if (date >= sunrise) return false
  // Before today's sunrise: still daylight if yesterday's sun hasn't set yet
  // (high latitudes in summer, where sunset falls after local midnight).
  const y = sunTimes(new Date(date.getTime() - DAY_MS), lat, lng, offsetMs)
  if (y.polar) return y.polar === 'night'
  return date > y.sunset
}

const SYNODIC = 29.530588853
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14) // a known new moon

const PHASES = [
  'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
  'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent',
]

/** Moon phase, and whether tides are near spring (bigger) or neap (smaller). */
export function moonPhase(date) {
  const age = (((date.getTime() - NEW_MOON_REF) / DAY_MS) % SYNODIC + SYNODIC) % SYNODIC
  const name = PHASES[Math.round((age / SYNODIC) * 8) % 8]
  const illumination = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2
  // Spring tides come a day or two either side of new and full moon; neap tides near the quarters.
  const fromSyzygy = Math.min(age, Math.abs(age - SYNODIC / 2), SYNODIC - age)
  const tides = fromSyzygy <= 2.5 ? 'spring' : fromSyzygy >= SYNODIC / 4 - 2.5 ? 'neap' : null
  const daysTo = (target) => (((target - age) % SYNODIC) + SYNODIC) % SYNODIC
  return {
    name, age, illumination, tides,
    nextFull: new Date(date.getTime() + daysTo(SYNODIC / 2) * DAY_MS),
    nextNew: new Date(date.getTime() + daysTo(0) * DAY_MS),
  }
}

// ---- Moonrise and moonset ----
// The Astronomical Almanac's low-precision lunar formulae (longitude good to about
// 0.3°), which put rise and set within a few minutes of a full ephemeris.
const OBLIQUITY = 23.4393 * rad
const sinD = (deg) => Math.sin(deg * rad)
const cosD = (deg) => Math.cos(deg * rad)

/**
 * How far the moon's upper limb is above the horizon (radians) at a moment: its
 * geocentric altitude less the rise/set altitude, which allows for the moon's parallax
 * and semi-diameter and for refraction (0.7275 × parallax − 34').
 */
function moonAltitude(ms, lat, lng) {
  const d = toJulian(ms) - J2000
  const T = d / 36525
  const lon = 218.32 + 481267.881 * T
    + 6.29 * sinD(135.0 + 477198.87 * T) - 1.27 * sinD(259.3 - 413335.36 * T)
    + 0.66 * sinD(235.7 + 890534.22 * T) + 0.21 * sinD(269.9 + 954397.74 * T)
    - 0.19 * sinD(357.5 + 35999.05 * T) - 0.11 * sinD(186.5 + 966404.03 * T)
  const latM = 5.13 * sinD(93.3 + 483202.02 * T) + 0.28 * sinD(228.2 + 960400.89 * T)
    - 0.28 * sinD(318.3 + 6003.15 * T) - 0.17 * sinD(217.6 - 407332.21 * T)
  const parallax = 0.9508 + 0.0518 * cosD(135.0 + 477198.87 * T) + 0.0095 * cosD(259.3 - 413335.36 * T)
    + 0.0078 * cosD(235.7 + 890534.22 * T) + 0.0028 * cosD(269.9 + 954397.74 * T)
  const l = lon * rad
  const b = latM * rad
  const ra = Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l))
  const dec = Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l))
  const H = rad * (280.46061837 + 360.98564736629 * d + lng) - ra // hour angle
  const phi = lat * rad
  const h = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  return h - (0.7275 * parallax - 0.5667) * rad
}

/**
 * Moonrise and moonset in the station-local calendar day containing `date`.
 * Either can be null: the moon rises about 50 minutes later each day, so about once a
 * month a day has no moonrise, and another has no moonset. `up` says whether the moon
 * is above the horizon at `date`.
 */
export function moonTimes(date, lat, lng, offsetMs) {
  const local = new Date(date.getTime() + offsetMs)
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs
  const HOUR = 3600e3
  const alt = (hours) => moonAltitude(start + hours * HOUR, lat, lng)
  let rise = null
  let set = null
  let h0 = alt(0)
  // Walk the day two hours at a time, fitting a parabola through three altitudes and
  // solving for where it crosses the horizon.
  for (let i = 1; i <= 24 && (rise == null || set == null); i += 2) {
    const h1 = alt(i)
    const h2 = alt(i + 1)
    const a = (h0 + h2) / 2 - h1
    const b = (h2 - h0) / 2
    const xe = -b / (2 * a)
    const ye = (a * xe + b) * xe + h1
    const disc = b * b - 4 * a * h1
    if (disc >= 0) {
      const dx = Math.sqrt(disc) / (Math.abs(a) * 2)
      let x1 = xe - dx
      const x2 = xe + dx
      const roots = (Math.abs(x1) <= 1 ? 1 : 0) + (Math.abs(x2) <= 1 ? 1 : 0)
      if (x1 < -1) x1 = x2
      if (roots === 1) {
        if (h0 < 0) rise = i + x1
        else set = i + x1
      } else if (roots === 2) {
        rise = i + (ye < 0 ? x2 : x1)
        set = i + (ye < 0 ? x1 : x2)
      }
    }
    h0 = h2
  }
  const at = (hours) => (hours == null || hours > 24 ? null : new Date(start + hours * HOUR))
  return { rise: at(rise), set: at(set), up: moonAltitude(date.getTime(), lat, lng) > 0 }
}

/** The next moonrise or moonset after `date` (looking through tomorrow). */
export function nextMoonEvent(date, lat, lng, offsetMs) {
  const events = []
  for (const day of [0, 1, 2]) {
    const m = moonTimes(new Date(date.getTime() + day * DAY_MS), lat, lng, offsetMs)
    if (m.rise) events.push({ type: 'rise', time: m.rise })
    if (m.set) events.push({ type: 'set', time: m.set })
  }
  return events.filter((e) => e.time > date).sort((a, b) => a.time - b.time)[0] ?? null
}
