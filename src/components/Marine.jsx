// Marine warnings in force and the marine forecast, from the National Weather Service.
// Warnings are listed first (tap for the detail); the forecast opens on request.
import Icon from './Icon.jsx'
import { useEffect, useState } from 'react'
import { fetchMarine, currentAlerts } from '../nws.js'
import { formatAtStation } from '../tides.js'
import { Explain } from './Explain.jsx'

const REFRESH_MS = 15 * 60e3

/** Warnings and forecast for a station's waters, refreshed every 15 minutes while online. */
export function useMarine(station, online) {
  const [state, setState] = useState(null)
  const lat = station?.lat
  const lng = station?.lng
  const id = station?.id
  useEffect(() => {
    if (lat == null || !online) return
    let cancelled = false
    const load = () => fetchMarine(lat, lng).then((d) => !cancelled && setState({ id, ...d })).catch(() => {})
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [id, lat, lng, online])
  // Nothing while offline: a saved warning could be out of date.
  return online && state?.id === id ? state : null
}

const ICON = (event) => (/hurricane|tropical|storm warning|gale/i.test(event) ? 'flag' : /flood|surge/i.test(event) ? 'wave' : /fog/i.test(event) ? 'fog' : /small craft|wind/i.test(event) ? 'wind' : 'warning')
const tidy = (s) => s.replace(/\n(?!\n)/g, ' ').replace(/ {2,}/g, ' ').trim()

export default function Marine({ marine, now, offsetMs }) {
  const [open, setOpen] = useState(null)
  if (!marine) return null
  const alerts = marine.alerts ? currentAlerts(marine.alerts, now) : []
  if (!alerts.length && !marine.forecast.length) return null
  const when = (d) => formatAtStation(d, offsetMs, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const shown = alerts.find((a) => a.id === open)
  return (
    <section className={`panel marine${alerts.length ? ' has-alerts' : ''}`}>
      <div className="panel-head">
        <h2>{alerts.length ? 'Warnings in force' : 'Marine forecast'}</h2>
        <Explain id="marine" />
      </div>
      {alerts.length > 0 && (
        <ul className="wx-alerts">
          {alerts.map((a) => (
            <li key={a.id}>
              <button type="button" className={`wx-alert sev-${a.rank}`} aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                <Icon name={ICON(a.event)} />
                <strong>{a.event}</strong>
                <small>{a.onset && a.onset > now ? `from ${when(a.onset)}` : `until ${when(a.ends)}`}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown && (
        <div className="wx-alert-detail" role="status">
          {shown.description && <p>{tidy(shown.description)}</p>}
          {shown.instruction && <p><strong>Advice:</strong> {tidy(shown.instruction)}</p>}
        </div>
      )}
      {marine.forecast.length > 0 && (
        <details className="wx-forecast">
          <summary><Icon name="cloud" /> {alerts.length ? 'Marine forecast' : `${marine.forecast[0].name}: ${marine.forecast[0].text}`}</summary>
          <dl>
            {marine.forecast.slice(alerts.length ? 0 : 1, 6).map((p) => (
              <div key={p.name}><dt>{p.name}</dt><dd>{p.text}</dd></div>
            ))}
          </dl>
        </details>
      )}
      <p className="hint small-print">
        National Weather Service{marine.zone ? ` · ${marine.zone.name}` : ''} · checked {formatAtStation(marine.fetchedAt, offsetMs)}
      </p>
    </section>
  )
}
