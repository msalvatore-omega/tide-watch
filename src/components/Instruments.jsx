import { useId } from 'react'
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
// The near side's dark plains (maria) as seen from the northern hemisphere: [cx, cy, rx, ry].
const MARIA = [
  [37, 31, 14, 12], [57, 32, 9, 9], [66, 45, 11, 9], [81, 36, 5, 6.5], [78, 57, 6, 8], [66, 61, 4.5, 4.5],
  [21, 46, 9, 17], [40, 67, 10, 8], [26, 67, 5, 5], [46, 14, 19, 3.2], [49, 47, 5, 4],
]
// Bright young craters: [cx, cy, r].
const CRATERS = [[45, 85, 2.6], [32, 49, 2.2], [20, 40, 1.4], [60, 76, 1.3], [72, 22, 1.2], [53, 60, 1.1]]

/** The moon at its current phase: lit part with maria and craters, the rest in faint earthshine. */
export function MoonDisc({ moon, size = 26 }) {
  const id = useId().replace(/:/g, '')
  const k = moon.illumination // 0 new … 1 full
  const waxing = moon.age < 29.530588853 / 2
  const r = 46
  const rx = r * Math.abs(1 - 2 * k)
  const detail = size >= 30
  // Lit limb on the right, then back along the terminator; mirrored when waning.
  const lit = `M 50 ${50 - r} A ${r} ${r} 0 0 1 50 ${50 + r} A ${rx} ${r} 0 0 ${k > 0.5 ? 1 : 0} 50 ${50 - r} Z`
  const features = (
    <>
      {MARIA.map(([cx, cy, mx, my]) => <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={mx} ry={my} />)}
    </>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="moon-disc">
      <defs>
        <radialGradient id={`${id}s`} cx="42%" cy="38%" r="70%">
          <stop offset="0" stopColor="#fdfbf2" />
          <stop offset="0.7" stopColor="#ece6d3" />
          <stop offset="1" stopColor="#c9c1a8" />
        </radialGradient>
        <clipPath id={`${id}c`}><circle cx="50" cy="50" r={r} /></clipPath>
        <filter id={`${id}b`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={detail ? 2.2 : 0.01} /></filter>
        <filter id={`${id}m`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" /></filter>
        <mask id={`${id}k`}>
          <g clipPath={`url(#${id}c)`}>
            <path d={lit} fill="#fff" filter={`url(#${id}b)`} transform={waxing ? undefined : 'translate(100 0) scale(-1 1)'} />
          </g>
        </mask>
      </defs>
      {/* the unlit part, faintly visible */}
      <circle cx="50" cy="50" r={r} fill="#3a4358" />
      {detail && <g clipPath={`url(#${id}c)`} fill="#2c3447" opacity="0.8" filter={`url(#${id}m)`}>{features}</g>}
      {/* the sunlit part */}
      <g mask={`url(#${id}k)`}>
        <circle cx="50" cy="50" r={r} fill={`url(#${id}s)`} />
        {detail && (
          <g clipPath={`url(#${id}c)`}>
            <g fill="#8f8b7c" opacity="0.5" filter={`url(#${id}m)`}>{features}</g>
            {CRATERS.map(([cx, cy, cr]) => (
              <g key={`${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r={cr * 2.2} fill="#fffef8" opacity="0.35" />
                <circle cx={cx} cy={cy} r={cr} fill="#fffef8" opacity="0.9" />
                <circle cx={cx + cr * 0.25} cy={cy + cr * 0.25} r={cr * 0.55} fill="#b9b29b" opacity="0.7" />
              </g>
            ))}
          </g>
        )}
      </g>
      <circle cx="50" cy="50" r={r} className="moon-rim" style={{ strokeWidth: detail ? 1.6 : 6 }} />
    </svg>
  )
}

/** 24-hour bar: night, daylight between sunrise and sunset, and a dot for now. */
function DaylightBar({ sun, moon, moonTimes, now, offsetMs }) {
  const dayStart = (() => {
    const local = new Date(now.getTime() + offsetMs)
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs
  })()
  const pct = (d) => Math.min(100, Math.max(0, ((d - dayStart) / 86400e3) * 100))
  const time = (d) => formatAtStation(d, offsetMs)
  const hasSun = Boolean(sun?.sunrise)
  const tides = moon.tides === 'spring' ? 'springs' : moon.tides === 'neap' ? 'neaps' : null
  return (
    <div className="daybar-wrap" role="img" aria-label={`${hasSun ? `Sunrise ${time(sun.sunrise)}, sunset ${time(sun.sunset)}. ` : sun?.polar === 'night' ? 'No sunrise today. ' : sun?.polar === 'day' ? 'Sun up all day. ' : ''}${moon.name}${tides ? `, ${tides}` : ''}.${moonTimes ? ` Moonrise ${moonTimes.rise ? time(moonTimes.rise) : 'not today'}, moonset ${moonTimes.set ? time(moonTimes.set) : 'not today'}.` : ''}`}>
      <div className="daybar" aria-hidden="true">
        {hasSun && <div className="daybar-day" style={{ left: `${pct(sun.sunrise)}%`, width: `${pct(sun.sunset) - pct(sun.sunrise)}%` }} />}
        {sun?.polar === 'day' && <div className="daybar-day" style={{ left: 0, width: '100%' }} />}
        <div className="daybar-now" style={{ left: `${pct(now)}%` }} />
      </div>
      <div className="daybar-labels" aria-hidden="true">
        {hasSun ? <><span><Icon name="sun" />↑ {time(sun.sunrise)}</span><span><Icon name="sun" />↓ {time(sun.sunset)}</span></> : <span>{sun?.polar === 'night' ? 'Polar night' : sun?.polar === 'day' ? 'Midnight sun' : ''}</span>}
        <span className="daybar-moon"><MoonDisc moon={moon} size={18} /> {tides ?? moon.name}</span>
      </div>
      {moonTimes && (
        <div className="daybar-labels moon-row" aria-hidden="true">
          <span><MoonDisc moon={moon} size={14} /> ↑ {moonTimes.rise ? time(moonTimes.rise) : 'none today'}</span>
          <span><MoonDisc moon={moon} size={14} /> ↓ {moonTimes.set ? time(moonTimes.set) : 'none today'}</span>
          <span>{moonTimes.up ? 'moon is up' : 'moon is down'}</span>
        </div>
      )}
    </div>
  )
}

export default function Instruments({ sun, moon, moonTimes, offsetMs, now }) {
  return (
    <section className="instruments" aria-label="Sun and moon">
      <DaylightBar sun={sun} moon={moon} moonTimes={moonTimes} now={now} offsetMs={offsetMs} />
      <Explain id="sun" className="corner" />
    </section>
  )
}
