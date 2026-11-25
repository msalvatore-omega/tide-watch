import { useEffect, useState } from 'react'
import { findAlerts, alertsToICS } from '../alerts.js'
import { formatStationTime, formatCountdown, ft } from '../tides.js'

const SETTINGS_KEY = 'tidewatch.alerts.v1'
const NOTIFIED_KEY = 'tidewatch.notified.v1'
const NOTIFY_LEAD_MS = 3 * 3600e3 // notify when a big swing starts within 3 hours

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ } }

/** Hook: current alert list + the user's alert settings. */
export function useSwingAlerts(events, now) {
  const [settings, setSettingsState] = useState(() => load(SETTINGS_KEY, { mode: 'auto', feet: 6, notify: false }))
  const setSettings = (s) => { setSettingsState(s); store(SETTINGS_KEY, s) }
  const result = events ? findAlerts(events, now, settings) : null
  return { settings, setSettings, ...result }
}

/** Banner for the top of the page when a big swing is under way or within 24 hours. */
export function AlertBanner({ alerts, now }) {
  const soon = alerts?.find((a) => a.from.time - now < 24 * 3600e3)
  if (!soon) return null
  return (
    <div className="alert-banner" role="status">
      <strong>⚠️ Big tide swing {soon.inProgress ? 'happening now' : formatCountdown(soon.from.time - now)}</strong>
      <span>
        Water {soon.rising ? 'rises' : 'drops'} {ft(soon.size)} by {formatStationTime(soon.to.local)}
        {' '}({soon.ratio.toFixed(1)}× a typical swing here)
      </span>
    </div>
  )
}

export default function AlertsPanel({ station, now, alerts, stats, threshold, settings, setSettings }) {
  const [notifyMsg, setNotifyMsg] = useState('')
  const supportsNotify = typeof Notification !== 'undefined' && 'serviceWorker' in navigator

  // While the app is open (or installed and running), notify shortly before each big swing.
  useEffect(() => {
    if (!settings.notify || !supportsNotify || Notification.permission !== 'granted' || !alerts) return
    const due = alerts.filter((a) => a.from.time - now < NOTIFY_LEAD_MS)
    for (const a of due) {
      const key = `${station.id}:${a.from.time.toISOString()}`
      if (load(NOTIFIED_KEY, {})[key]) continue
      navigator.serviceWorker.ready
        .then((reg) =>
          reg.showNotification(`🌊 Big tide swing at ${station.name}`, {
            body: `Water ${a.rising ? 'rises' : 'drops'} ${ft(a.size)} from ${formatStationTime(a.from.local, { withDay: false })} to ${formatStationTime(a.to.local, { withDay: false })}.`,
            tag: key, // same tag = replaces rather than duplicates
            icon: './icon-192.png',
          }),
        )
        .then(() => {
          // Record only after it was actually shown, so failures are retried next tick.
          const notified = load(NOTIFIED_KEY, {})
          notified[key] = Date.now()
          for (const [k, t] of Object.entries(notified)) if (Date.now() - t > 14 * 24 * 3600e3) delete notified[k]
          store(NOTIFIED_KEY, notified)
        })
        .catch(() => {})
    }
  }, [alerts, now, settings.notify, station, supportsNotify])

  const toggleNotify = async () => {
    if (settings.notify) return setSettings({ ...settings, notify: false })
    if (!supportsNotify) return setNotifyMsg('This browser cannot show notifications. Use “Add to calendar” instead.')
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return setNotifyMsg('Notifications are blocked. Allow them in your browser settings, or use “Add to calendar”.')
    setNotifyMsg('')
    setSettings({ ...settings, notify: true })
  }

  const downloadCalendar = () => {
    const blob = new Blob([alertsToICS(alerts, station.name)], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tide-swings-${station.id}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <section className="panel alerts">
      <h2>Big swing alerts · next 7 days</h2>
      <p className="hint">
        A typical swing here is {ft(stats.typical)}. Alerting on swings of {ft(threshold)} or more
        {settings.mode === 'auto' ? ' (the biggest 10% this month)' : ''}.
      </p>

      {alerts.length === 0 ? (
        <p className="calm">😌 No big swings in the next week.</p>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.from.time.toISOString()} className={a.inProgress ? 'live' : ''}>
              <div className="swing">
                <span className="size">{a.rising ? '⬆️' : '⬇️'} {ft(a.size)}</span>
                <span className="ratio">{a.ratio.toFixed(1)}× typical</span>
              </div>
              <div className="when">
                {formatStationTime(a.from.local)} → {formatStationTime(a.to.local, { withDay: false })}
                <small>{a.inProgress ? 'Happening now' : formatCountdown(a.from.time - now)} · {ft(a.from.height)} to {ft(a.to.height)}</small>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="alert-controls">
        <label>
          Alert me on
          <select
            value={settings.mode === 'auto' ? 'auto' : String(settings.feet)}
            onChange={(e) => setSettings(e.target.value === 'auto' ? { ...settings, mode: 'auto' } : { ...settings, mode: 'custom', feet: Number(e.target.value) })}
          >
            <option value="auto">Unusually big swings for this spot</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((f) => <option key={f} value={f}>Swings of {f} ft or more</option>)}
          </select>
        </label>
        <div className="alert-buttons">
          <button type="button" className={settings.notify ? 'secondary on' : 'secondary'} onClick={toggleNotify} aria-pressed={settings.notify}>
            {settings.notify ? '🔔 Notifications on' : '🔕 Notify me'}
          </button>
          <button type="button" className="secondary ghost" onClick={downloadCalendar} disabled={!alerts.length}>📅 Add to calendar</button>
        </div>
        {notifyMsg && <p className="hint">{notifyMsg}</p>}
        {settings.notify && <p className="hint">You'll get a notification about 3 hours before each big swing while Tide Watch is open. For reminders when it's closed, use Add to calendar.</p>}
      </div>
    </section>
  )
}
