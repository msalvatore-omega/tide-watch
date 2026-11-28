// Sun and moon as a picture: a 24-hour daylight bar with a marker for now, and the moon
// drawn at its phase. (Wind, temperatures and barometer are drawn on the scene itself.)
import { useId } from 'react'
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

// The near side's dark plains (maria) as seen from the northern hemisphere: [cx, cy, rx, ry].
const MARIA = [
  [37, 31, 14, 12], [57, 32, 9, 9], [66, 45, 11, 9], [81, 36, 5, 6.5], [78, 57, 6, 8], [66, 61, 4.5, 4.5],
  [21, 46, 9, 17], [40, 67, 10, 8], [26, 67, 5, 5], [46, 14, 19, 3.2], [49, 47, 5, 4],
]
// Bright young craters: [cx, cy, r].
const CRATERS = [[45, 85, 2.6], [32, 49, 2.2], [20, 40, 1.4], [60, 76, 1.3], [72, 22, 1.2], [53, 60, 1.1]]
const HALF_MONTH = 29.530588853 / 2

/**
 * The moon at its current phase. Small sizes get a plain two-tone disc; from 30px up it
 * is drawn with maria and craters, a soft shadow edge and the unlit part faintly visible.
 * `south` turns it the way it is seen from south of the equator (upside down, so the
 * other side is lit).
 */
export function MoonDisc({ moon, size = 26, south = false }) {
  return size >= 30 ? <MoonDetailed moon={moon} size={size} south={south} /> : <MoonPlain moon={moon} size={size} south={south} />
}

function MoonPlain({ moon, size, south }) {
  const k = moon.illumination // 0 new … 1 full
  const waxing = moon.age < HALF_MONTH
  const r = 12
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="moon-disc">
      <g transform={south ? 'rotate(180 14 14)' : undefined}>
        <circle cx="14" cy="14" r={r} className="moon-dark" />
        {/* the lit half (right when waxing, left when waning) … */}
        <path d={`M 14 2 A ${r} ${r} 0 0 ${waxing ? 1 : 0} 14 26 Z`} className="moon-lit" />
        {/* … widened to gibbous or narrowed to a crescent by an ellipse */}
        <ellipse cx="14" cy="14" rx={r * Math.abs(1 - 2 * k)} ry={r} className={k > 0.5 ? 'moon-lit' : 'moon-dark'} />
      </g>
      <circle cx="14" cy="14" r={r} className="moon-rim" />
    </svg>
  )
}

function MoonDetailed({ moon, size, south }) {
  const id = useId().replace(/:/g, '')
  // A crescent thinner than about 6% would be lost under the rim at this size, so it is
  // drawn at least that wide (the label still gives the true figure).
  const k = /crescent/i.test(moon.name) ? Math.max(moon.illumination, 0.06) : moon.illumination
  const waxing = moon.age < HALF_MONTH
  const r = 46
  const rx = r * Math.abs(1 - 2 * k)
  // The lit region runs far outside the disc on the sunward side, so only the shadow
  // edge is softened and the clip leaves the limb sharp. Mirrored when waning.
  const lit = `M 50 -30 H 140 V 130 H 50 V ${50 + r} A ${rx} ${r} 0 0 ${k > 0.5 ? 1 : 0} 50 ${50 - r} Z`
  // Soften less when the crescent (or the dark sliver near full) is thin, so it is not blurred away.
  const soften = Math.min(2.2, Math.max(0.25, (r - rx) * 0.3))
  const maria = MARIA.map(([cx, cy, mx, my]) => <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={mx} ry={my} />)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="moon-disc">
      <defs>
        <radialGradient id={`${id}s`} cx="42%" cy="38%" r="70%">
          <stop offset="0" className="moon-hi" />
          <stop offset="0.7" className="moon-mid" />
          <stop offset="1" className="moon-limb" />
        </radialGradient>
        <clipPath id={`${id}c`}><circle cx="50" cy="50" r={r} /></clipPath>
        <filter id={`${id}b`} filterUnits="userSpaceOnUse" x="-50" y="-50" width="210" height="200"><feGaussianBlur stdDeviation={soften} /></filter>
        <filter id={`${id}m`} filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="1.6" /></filter>
        <mask id={`${id}k`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <g clipPath={`url(#${id}c)`}>
            <path d={lit} fill="#fff" filter={`url(#${id}b)`} transform={waxing ? undefined : 'translate(100 0) scale(-1 1)'} />
          </g>
        </mask>
      </defs>
      <g transform={south ? 'rotate(180 50 50)' : undefined}>
        {/* the unlit part, faintly visible */}
        <circle cx="50" cy="50" r={r} className="moon-shade" />
        <g clipPath={`url(#${id}c)`} className="moon-shade-sea" filter={`url(#${id}m)`}>{maria}</g>
        {/* the sunlit part */}
        <g mask={`url(#${id}k)`}>
          <circle cx="50" cy="50" r={r} fill={`url(#${id}s)`} />
          <g clipPath={`url(#${id}c)`}>
            <g className="moon-sea" filter={`url(#${id}m)`}>{maria}</g>
            {CRATERS.map(([cx, cy, cr]) => (
              <g key={`${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r={cr * 2.2} className="moon-ray" />
                <circle cx={cx} cy={cy} r={cr} className="moon-crater" />
                <circle cx={cx + cr * 0.25} cy={cy + cr * 0.25} r={cr * 0.55} className="moon-pit" />
              </g>
            ))}
          </g>
        </g>
      </g>
      <circle cx="50" cy="50" r={r} className="moon-rim moon-rim-fine" />
    </svg>
  )
}

/** 24-hour bar: night, daylight between sunrise and sunset, and a dot for now. */
function DaylightBar({ sun, moon, moonTimes, now, offsetMs, south }) {
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
        <span className="daybar-moon"><MoonDisc moon={moon} size={18} south={south} /> {tides ?? moon.name}</span>
      </div>
      {moonTimes && (
        <div className="daybar-labels moon-row" aria-hidden="true">
          <span><MoonDisc moon={moon} size={14} south={south} /> ↑ {moonTimes.rise ? time(moonTimes.rise) : 'none today'}</span>
          <span><MoonDisc moon={moon} size={14} south={south} /> ↓ {moonTimes.set ? time(moonTimes.set) : 'none today'}</span>
          <span>{moonTimes.up ? 'moon is up' : 'moon is down'}</span>
        </div>
      )}
    </div>
  )
}

export default function Instruments({ sun, moon, moonTimes, offsetMs, now, south = false }) {
  return (
    <section className="instruments" aria-label="Sun and moon">
      <DaylightBar sun={sun} moon={moon} moonTimes={moonTimes} now={now} offsetMs={offsetMs} south={south} />
      <Explain id="sun" className="corner" />
    </section>
  )
}
