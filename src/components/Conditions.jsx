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

export default function Conditions({ weather, source, sun, moon, offsetMs }) {
  const w = weather?.wind
  const p = weather?.pressure
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
        {(weather?.waterTemp || weather?.airTemp) && (
          <Cell
            icon="🌡️"
            label="Water · Air"
            value={`${weather.waterTemp ? `${Math.round(weather.waterTemp.f)}°F` : '—'} · ${weather.airTemp ? `${Math.round(weather.airTemp.f)}°F` : '—'}`}
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
      {source && <p className="cond-source">Weather from the {source} gauge</p>}
    </section>
  )
}
