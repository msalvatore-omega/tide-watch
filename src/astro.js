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
  ['🌑', 'New moon'], ['🌒', 'Waxing crescent'], ['🌓', 'First quarter'], ['🌔', 'Waxing gibbous'],
  ['🌕', 'Full moon'], ['🌖', 'Waning gibbous'], ['🌗', 'Last quarter'], ['🌘', 'Waning crescent'],
]

/** Moon phase, and whether tides are near spring (bigger) or neap (smaller). */
export function moonPhase(date) {
  const age = (((date.getTime() - NEW_MOON_REF) / DAY_MS) % SYNODIC + SYNODIC) % SYNODIC
  const [emoji, name] = PHASES[Math.round((age / SYNODIC) * 8) % 8]
  const illumination = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2
  // Spring tides come a day or two either side of new and full moon; neap tides near the quarters.
  const fromSyzygy = Math.min(age, Math.abs(age - SYNODIC / 2), SYNODIC - age)
  const tides = fromSyzygy <= 2.5 ? 'spring' : fromSyzygy >= SYNODIC / 4 - 2.5 ? 'neap' : null
  const daysTo = (target) => (((target - age) % SYNODIC) + SYNODIC) % SYNODIC
  return {
    emoji, name, age, illumination, tides,
    nextFull: new Date(date.getTime() + daysTo(SYNODIC / 2) * DAY_MS),
    nextNew: new Date(date.getTime() + daysTo(0) * DAY_MS),
  }
}
