// Pure helpers for tidal currents (slack water, max flood, max ebb).

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compass = (deg) => (deg == null ? '' : POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16])

/**
 * What the current is doing at `now`, estimated from the surrounding slack/max events
 * (speed follows a sine curve between slack and the next maximum).
 * Returns null when `now` is outside the predictions.
 */
export function currentNow(events, now) {
  const i = events.findIndex((e) => e.time > now)
  if (i < 1) return null
  const prev = events[i - 1]
  const next = events[i]
  const frac = (now - prev.time) / (next.time - prev.time)
  // Which way is the water moving in this segment?
  const phase = prev.type !== 'slack' ? prev.type : next.type !== 'slack' ? next.type : null
  let knots = 0
  if (prev.type === 'slack' && next.type !== 'slack') knots = next.knots * Math.sin((Math.PI / 2) * frac)
  else if (prev.type !== 'slack' && next.type === 'slack') knots = prev.knots * Math.cos((Math.PI / 2) * frac)
  else if (prev.type !== 'slack' && next.type !== 'slack') knots = prev.knots + (next.knots - prev.knots) * frac // max → max, no slack between
  const upcoming = events.slice(i)
  const dirOf = (type) => (type === 'flood' ? next.floodDir ?? prev.floodDir : next.ebbDir ?? prev.ebbDir)
  return {
    state: knots < 0.1 || !phase ? 'slack' : phase,
    phase,
    knots,
    dir: phase ? dirOf(phase) : null,
    building: prev.type === 'slack', // speeding up toward the next maximum
    nextSlack: upcoming.find((e) => e.type === 'slack') ?? null,
    nextFlood: upcoming.find((e) => e.type === 'flood') ?? null,
    nextEbb: upcoming.find((e) => e.type === 'ebb') ?? null,
  }
}

/** Signed speed at time t for charting: flood positive, ebb negative, null outside the data. */
export function speedAt(events, t) {
  const c = currentNow(events, t)
  if (!c) return null
  return c.phase === 'ebb' ? -c.knots : c.knots
}

/**
 * Wind against tide: wind blowing against the current heaps the sea up short and steep.
 * `windFrom` is the direction the wind blows FROM (degrees), `set` the direction the
 * current flows TOWARD. Opposed when the two are within 45° of each other.
 * Returns null (not opposed, or too little of either) or { angle, strong }.
 */
export function windAgainstCurrent(windFrom, windKnots, set, drift) {
  if (windFrom == null || set == null || !(windKnots >= 10) || !(drift >= 0.5)) return null
  const angle = Math.abs(((windFrom - set + 540) % 360) - 180) // 0 = dead against
  if (angle > 45) return null
  return { angle, strong: windKnots >= 17 && drift >= 1 }
}
