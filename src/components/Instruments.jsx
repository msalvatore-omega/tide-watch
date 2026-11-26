// Conditions as instruments rather than text: wind compass, temperatures, barometer
// with its trend, a daylight bar and the moon drawn at its phase.
import { formatAtStation, beaufort } from '../tides.js'

const MAX_AGE_MS = 3 * 3600e3 // don't show old readings (e.g. saved data while offline) as current

/** Compass rose with an arrow flying in from the direction the wind blows from. */
function WindCompass({ wind }) {
  const bf = beaufort(wind.knots)
  const deg = wind.deg ?? 0
  return (
    <div className="inst" role="img" aria-label={`Wind ${wind.dir ?? ''} ${Math.round(wind.knots)} knots, force ${bf.force}, ${bf.name}${wind.gust != null ? `, gusting ${Math.round(wind.gust)}` : ''}`}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="33" className="inst-ring" />
        {[0, 90, 180, 270].map((a) => <line key={a} x1="40" y1="7" x2="40" y2="13" className="inst-tick" transform={`rotate(${a} 40 40)`} />)}
        <text x="40" y="1" textAnchor="middle" className="inst-n">N</text>
        {wind.deg != null && (
          <g transform={`rotate(${deg} 40 40)`}>
            {/* tail on the rim at the wind's origin, head toward the centre */}
            <line x1="40" y1="3" x2="40" y2="12" className="inst-arrow" />
            <polygon points="40,21 34.5,11 45.5,11" className="inst-arrow-head" />
          </g>
        )}
        <text x="40" y="49" textAnchor="middle" className="inst-big">{Math.round(wind.knots)}</text>
        <text x="40" y="60" textAnchor="middle" className="inst-unit">kt</text>
      </svg>
      <div className="inst-cap" aria-hidden="true">{wind.dir ?? 'Wind'} · F{bf.force}{wind.gust != null ? ` · G${Math.round(wind.gust)}` : ''}</div>
    </div>
  )
}

function Temps({ sea, air }) {
  return (
    <div className="inst" role="img" aria-label={`Sea ${sea ? `${Math.round(sea.f)} degrees` : 'not reported'}, air ${air ? `${Math.round(air.f)} degrees` : 'not reported'} Fahrenheit`}>
      <div className="inst-temps" aria-hidden="true">
        <div><span className="inst-temp-icon">🌊</span><span className="inst-big-html">{sea ? `${Math.round(sea.f)}°` : '—'}</span></div>
        <div><span className="inst-temp-icon">🌬️</span><span className="inst-mid-html">{air ? `${Math.round(air.f)}°` : '—'}</span></div>
      </div>
      <div className="inst-cap" aria-hidden="true">Sea · Air °F</div>
    </div>
  )
}

function Barometer({ pressure }) {
  const c = pressure.change3h
  const trend = c == null ? null : c > 1 ? 'rising' : c < -1 ? 'falling' : 'steady'
  const rot = trend === 'rising' ? -40 : trend === 'falling' ? 40 : 0
  return (
    <div className="inst" role="img" aria-label={`Barometer ${Math.round(pressure.mb)} millibars${trend ? `, ${trend}` : ''}`}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        {trend && (
          <g transform={`rotate(${rot} 40 22)`} className={`inst-trend ${trend}`}>
            <line x1="24" y1="22" x2="48" y2="22" />
            <polygon points="56,22 46,16 46,28" />
          </g>
        )}
        <text x="40" y="56" textAnchor="middle" className="inst-mid">{Math.round(pressure.mb)}</text>
        <text x="40" y="68" textAnchor="middle" className="inst-unit">mb</text>
      </svg>
      <div className="inst-cap" aria-hidden="true">Baro{trend ? ` · ${trend}` : ''}</div>
    </div>
  )
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
        {hasSun ? <><span>☀️↑ {time(sun.sunrise)}</span><span>☀️↓ {time(sun.sunset)}</span></> : <span>{sun?.polar === 'night' ? 'Polar night' : sun?.polar === 'day' ? 'Midnight sun' : ''}</span>}
        <span className="daybar-moon"><MoonDisc moon={moon} size={18} /> {tides ?? moon.name}</span>
      </div>
    </div>
  )
}

export default function Instruments({ weather, source, sun, moon, offsetMs, now }) {
  const fresh = (x) => (x && (!x.time || now - x.time < MAX_AGE_MS) ? x : null)
  const wind = fresh(weather?.wind)
  const pressure = fresh(weather?.pressure)
  const sea = fresh(weather?.waterTemp)
  const air = fresh(weather?.airTemp)
  const any = wind || pressure || sea || air

  return (
    <section className="instruments" aria-label="Conditions at the station">
      {any && (
        <div className="inst-row">
          {wind && <WindCompass wind={wind} />}
          {(sea || air) && <Temps sea={sea} air={air} />}
          {pressure && <Barometer pressure={pressure} />}
        </div>
      )}
      <DaylightBar sun={sun} moon={moon} now={now} offsetMs={offsetMs} />
      {source && any && <p className="cond-source">Observations: {source}</p>}
    </section>
  )
}
