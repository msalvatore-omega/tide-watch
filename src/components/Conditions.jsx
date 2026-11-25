// Compact strip: observations at the gauge (wind, sea and air temperature, barometer)
// plus sunrise/sunset and the moon. Wind in knots with Beaufort force, as at sea.
import { formatAtStation, beaufort } from '../tides.js'

const MAX_AGE_MS = 3 * 3600e3 // don't show old readings (e.g. saved data while offline) as current

function Cell({ icon, label, value, sub }) {
  return (
    <div className="cond">
      <span className="cond-icon" aria-hidden="true">{icon}</span>
      <div>
        <div className="cond-label">{label}</div>
        <div className="cond-value">{value}</div>
        {sub && <div className="cond-sub">{sub}</div>}
      </div>
    </div>
  )
}

export default function Conditions({ weather, source, sun, moon, offsetMs, now }) {
  const fresh = (x) => (x && (!now || !x.time || now - x.time < MAX_AGE_MS) ? x : null)
  const w = fresh(weather?.wind)
  const p = fresh(weather?.pressure)
  const waterTemp = fresh(weather?.waterTemp)
  const airTemp = fresh(weather?.airTemp)
  const trend = p?.change3h == null ? null : p.change3h > 1 ? 'rising' : p.change3h < -1 ? 'falling' : 'steady'
  const time = (d) => (d ? formatAtStation(d, offsetMs) : '—')
  const bf = w ? beaufort(w.knots) : null

  return (
    <section className="conditions" aria-label="Conditions at the station">
      <div className="cond-grid">
        {w && (
          <Cell
            icon="💨"
            label="Wind"
            value={`${w.dir ?? ''} ${Math.round(w.knots)} kt`}
            sub={`Force ${bf.force}, ${bf.name.toLowerCase()}${w.gust != null ? ` · gusts ${Math.round(w.gust)} kt` : ''}`}
          />
        )}
        {(waterTemp || airTemp) && (
          <Cell
            icon="🌡️"
            label="Sea · Air"
            value={`${waterTemp ? `${Math.round(waterTemp.f)}°F` : '—'} · ${airTemp ? `${Math.round(airTemp.f)}°F` : '—'}`}
          />
        )}
        {p && <Cell icon="⏲️" label="Barometer" value={`${Math.round(p.mb)} mb`} sub={trend} />}
        {(sun?.sunrise || moon) && (
          <Cell
            icon="🌅"
            label="Sunrise · Sunset"
            value={sun?.sunrise ? `${time(sun.sunrise)} – ${time(sun.sunset)}` : moon.name}
            sub={moon ? `${moon.emoji} ${sun?.sunrise ? moon.name : ''}${moon.tides ? `${sun?.sunrise ? ' · ' : ''}${moon.tides === 'spring' ? 'springs' : 'neaps'}` : ''}` : null}
          />
        )}
      </div>
      {source && (w || p || waterTemp || airTemp) && <p className="cond-source">Observations from the {source} station</p>}
    </section>
  )
}
