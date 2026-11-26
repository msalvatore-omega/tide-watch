// Sun and moon as a picture: a 24-hour daylight bar with a marker for now, and the moon
// drawn at its phase. (Wind, temperatures and barometer are drawn on the scene itself.)
import Icon from './Icon.jsx'
import { formatAtStation } from '../tides.js'
import { Explain } from './Explain.jsx'

const MAX_AGE_MS = 3 * 3600e3 // don't show old readings (e.g. saved data while offline) as current

/** Only readings recent enough to call "current". */
export function freshWeather(weather, now) {
  if (!weather) return null
  const fresh = (x) => (x && (!x.time || now - x.time < MAX_AGE_MS) ? x : null)
  const out = { wind: fresh(weather.wind), pressure: fresh(weather.pressure), waterTemp: fresh(weather.waterTemp), airTemp: fresh(weather.airTemp) }
  return out.wind || out.pressure || out.waterTemp || out.airTemp ? out : null
}

/** The moon as it looks tonight: lit part drawn from its age in the lunar month. */
export function MoonDisc({ moon, size = 26 }) {
  const k = moon.illumination // 0 new … 1 full
  const waxing = moon.age < 29.530588853 / 2
  const r = 12
  const rx = r * Math.abs(1 - 2 * k)
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="moon-disc">
      <circle cx="14" cy="14" r={r} className="moon-dark" />
      {/* the lit half (right when waxing, left when waning) … */}
      <path d={`M 14 2 A ${r} ${r} 0 0 ${waxing ? 1 : 0} 14 26 Z`} className="moon-lit" />
      {/* … widened to gibbous or narrowed to a crescent by an ellipse */}
      <ellipse cx="14" cy="14" rx={rx} ry={r} className={k > 0.5 ? 'moon-lit' : 'moon-dark'} />
      <circle cx="14" cy="14" r={r} className="moon-rim" />
    </svg>
  )
}

/** 24-hour bar: night, daylight between sunrise and sunset, and a dot for now. */
function DaylightBar({ sun, moon, now, offsetMs }) {
  const dayStart = (() => {
    const local = new Date(now.getTime() + offsetMs)
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs
  })()
  const pct = (d) => Math.min(100, Math.max(0, ((d - dayStart) / 86400e3) * 100))
  const time = (d) => formatAtStation(d, offsetMs)
  const hasSun = Boolean(sun?.sunrise)
  const tides = moon.tides === 'spring' ? 'springs' : moon.tides === 'neap' ? 'neaps' : null
  return (
    <div className="daybar-wrap" role="img" aria-label={`${hasSun ? `Sunrise ${time(sun.sunrise)}, sunset ${time(sun.sunset)}. ` : sun?.polar === 'night' ? 'No sunrise today. ' : sun?.polar === 'day' ? 'Sun up all day. ' : ''}${moon.name}${tides ? `, ${tides}` : ''}.`}>
      <div className="daybar" aria-hidden="true">
        {hasSun && <div className="daybar-day" style={{ left: `${pct(sun.sunrise)}%`, width: `${pct(sun.sunset) - pct(sun.sunrise)}%` }} />}
        {sun?.polar === 'day' && <div className="daybar-day" style={{ left: 0, width: '100%' }} />}
        <div className="daybar-now" style={{ left: `${pct(now)}%` }} />
      </div>
      <div className="daybar-labels" aria-hidden="true">
        {hasSun ? <><span><Icon name="sun" />↑ {time(sun.sunrise)}</span><span><Icon name="sun" />↓ {time(sun.sunset)}</span></> : <span>{sun?.polar === 'night' ? 'Polar night' : sun?.polar === 'day' ? 'Midnight sun' : ''}</span>}
        <span className="daybar-moon"><MoonDisc moon={moon} size={18} /> {tides ?? moon.name}</span>
      </div>
    </div>
  )
}

export default function Instruments({ sun, moon, offsetMs, now }) {
  return (
    <section className="instruments" aria-label="Sun and moon">
      <DaylightBar sun={sun} moon={moon} now={now} offsetMs={offsetMs} />
      <Explain id="sun" className="corner" />
    </section>
  )
}
