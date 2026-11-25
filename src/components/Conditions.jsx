// Compact strip: gauge weather (wind, temperatures, pressure) + sun and moon.
import { formatAtStation } from '../tides.js'

const MPH_PER_KNOT = 1.15078

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

const MAX_AGE_MS = 3 * 3600e3 // don't show old readings (e.g. saved data while offline) as current

export default function Conditions({ weather, source, sun, moon, offsetMs, now }) {
  const fresh = (x) => (x && (!now || !x.time || now - x.time < MAX_AGE_MS) ? x : null)
  const w = fresh(weather?.wind)
  const p = fresh(weather?.pressure)
  const waterTemp = fresh(weather?.waterTemp)
  const airTemp = fresh(weather?.airTemp)
  const trend = p?.change3h == null ? '' : p.change3h > 1 ? ' ↑ rising' : p.change3h < -1 ? ' ↓ falling' : ' → steady'
  const time = (d) => (d ? formatAtStation(d, offsetMs) : '—')

  return (
    <section className="conditions" aria-label="Conditions">
      <div className="cond-grid">
        {w && (
          <Cell
            icon="💨"
            label="Wind"
            value={`${w.dir ?? ''} ${Math.round(w.knots * MPH_PER_KNOT)} mph`}
            sub={`${Math.round(w.knots)} kt${w.gust != null ? ` · gust ${Math.round(w.gust * MPH_PER_KNOT)}` : ''}`}
          />
        )}
        {(waterTemp || airTemp) && (
          <Cell
            icon="🌡️"
            label="Water · Air"
            value={`${waterTemp ? `${Math.round(waterTemp.f)}°F` : '—'} · ${airTemp ? `${Math.round(airTemp.f)}°F` : '—'}`}
          />
        )}
        {p && <Cell icon="⏲️" label="Pressure" value={`${Math.round(p.mb)} mb`} sub={trend.trim() || null} />}
        {(sun?.sunrise || moon) && (
          <Cell
            icon="🌅"
            label="Sun · Moon"
            value={sun?.sunrise ? `${time(sun.sunrise)} – ${time(sun.sunset)}` : moon.name}
            sub={moon ? `${moon.emoji} ${sun?.sunrise ? moon.name : ''}${moon.tides ? `${sun?.sunrise ? ' · ' : ''}${moon.tides} tides` : ''}` : null}
          />
        )}
      </div>
      {source && (w || p || waterTemp || airTemp) && <p className="cond-source">Weather from the {source} gauge</p>}
    </section>
  )
}
