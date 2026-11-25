import { useEffect, useState } from 'react'
import { findAlerts, alertsToICS } from '../alerts.js'
import { formatStationTime, formatCountdown, ft } from '../tides.js'
import { diffText, isSurge, SURGE_CHOICES, DEFAULT_SURGE_FT } from '../live.js'
import { pushSupported, needsHomeScreen, enablePush, syncPush, disablePush, sendTestPush } from '../push.js'

const SETTINGS_KEY = 'tidewatch.alerts.v1'
const NOTIFIED_KEY = 'tidewatch.notified.v1'
const SURGE_STATE_KEY = 'tidewatch.surge.v1'
const NOTIFY_LEAD_MS = 3 * 3600e3 // notify when a big swing starts within 3 hours
const DEFAULTS = { mode: 'auto', feet: 6, notify: false, push: false, surgeFeet: DEFAULT_SURGE_FT }

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ } }

const canNotify = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator && Notification.permission === 'granted'

function notify(title, body, tag) {
  return navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, tag, icon: './icon-192.png' }))
}

/** Hook: current alert list + the user's alert settings (swing and surge). */
export function useSwingAlerts(events, now) {
  const [settings, setSettingsState] = useState(() => ({ ...DEFAULTS, ...load(SETTINGS_KEY, {}) }))
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

/** Banner when the live gauge is off the forecast by the user's surge level. */
export function SurgeBanner({ reading, surgeFeet, onShowLive }) {
  if (!isSurge(reading, surgeFeet)) return null
  return (
    <div className="alert-banner surge" role="status">
      <strong>🌬️ Water is {diffText(reading.diff)}</strong>
      <span>
        The gauge reads {ft(reading.height)} where the forecast expected {ft(reading.predicted)}. Wind or a storm is moving the water.
      </span>
      {onShowLive && <button type="button" className="link" onClick={onShowLive}>See the live gauge →</button>}
    </div>
  )
}

export default function AlertsPanel({ station, now, alerts, stats, threshold, settings, setSettings, reading, liveStatus }) {
  const [notifyMsg, setNotifyMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const supportsNotify = typeof Notification !== 'undefined' && 'serviceWorker' in navigator
  // With background push on, the alerts server sends everything; the in-app checks below stand down.
  const inApp = settings.notify && !settings.push

  // Keep the alerts server watching the station and settings shown here.
  const { mode, feet, surgeFeet } = settings
  useEffect(() => {
    if (!settings.notify || !settings.push) return
    const t = setTimeout(() => {
      syncPush(station, { mode, feet, surgeFeet })
        .catch(() => enablePush(station, { mode, feet, surgeFeet })) // subscription expired: renew it
        .catch((e) => setNotifyMsg(`Couldn't update background alerts: ${e.message}`))
    }, 800)
    return () => clearTimeout(t)
  }, [station, mode, feet, surgeFeet, settings.notify, settings.push])

  // Big swings: notify shortly before each one.
  useEffect(() => {
    if (!inApp || !canNotify() || !alerts) return
    const due = alerts.filter((a) => a.from.time - now < NOTIFY_LEAD_MS)
    for (const a of due) {
      const key = `${station.id}:${a.from.time.toISOString()}`
      if (load(NOTIFIED_KEY, {})[key]) continue
      notify(
        `🌊 Big tide swing at ${station.name}`,
        `Water ${a.rising ? 'rises' : 'drops'} ${ft(a.size)} from ${formatStationTime(a.from.local, { withDay: false })} to ${formatStationTime(a.to.local, { withDay: false })}.`,
        key, // same tag = replaces rather than duplicates
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
  }, [alerts, now, inApp, station])

  // Surge: notify once when the water crosses the level, then stay quiet until it
  // eases back (below 75% of the level) or flips from above to below the forecast.
  const readingTime = reading?.time?.getTime()
  const readingDiff = reading?.diff
  const readingAge = reading?.ageMs
  useEffect(() => {
    if (readingDiff == null || settings.surgeFeet == null) return
    const episodes = load(SURGE_STATE_KEY, {})
    const active = episodes[station.id]
    const dir = readingDiff > 0 ? 'above' : 'below'
    const over = Math.abs(readingDiff) >= settings.surgeFeet

    if (active && (Math.abs(readingDiff) < settings.surgeFeet * 0.75 || active.dir !== dir)) {
      delete episodes[station.id] // episode over; the next surge will notify again
      store(SURGE_STATE_KEY, episodes)
    }
    const stillActive = load(SURGE_STATE_KEY, {})[station.id]
    if (!over || stillActive || !inApp || !canNotify() || readingAge > 60 * 60e3) return

    notify(
      `🌬️ Water ${diffText(readingDiff)} at ${station.name}`,
      `The live gauge reads ${Math.abs(readingDiff).toFixed(1)} ft ${dir} the tide forecast. Wind or a storm is moving the water.`,
      `${station.id}:surge`,
    )
      .then(() => {
        const latest = load(SURGE_STATE_KEY, {})
        latest[station.id] = { dir, at: Date.now() }
        store(SURGE_STATE_KEY, latest)
      })
      .catch(() => {})
  }, [readingTime, readingDiff, readingAge, settings.surgeFeet, inApp, station])

  const toggleNotify = async () => {
    setNotifyMsg('')
    if (settings.notify) {
      if (settings.push) disablePush().catch(() => {})
      return setSettings({ ...settings, notify: false, push: false })
    }
    if (needsHomeScreen()) {
      return setNotifyMsg('On iPhone and iPad, first add Tidely to your Home Screen (Share → Add to Home Screen), then open it from there and turn on alerts.')
    }
    if (!supportsNotify) return setNotifyMsg('This browser cannot show notifications. Use “Add to calendar” instead.')
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return setNotifyMsg('Notifications are blocked. Allow them in your browser settings, or use “Add to calendar”.')
    if (!pushSupported()) return setSettings({ ...settings, notify: true, push: false })
    setBusy(true)
    try {
      await enablePush(station, settings)
      setSettings({ ...settings, notify: true, push: true })
    } catch (e) {
      setSettings({ ...settings, notify: true, push: false })
      setNotifyMsg(`Background alerts aren't available right now (${e.message}). You'll still get alerts while Tidely is open.`)
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setNotifyMsg('')
    try {
      await sendTestPush()
      setNotifyMsg('Test sent. It should arrive within a few seconds, even if you close Tidely now.')
    } catch (e) {
      setNotifyMsg(`Test failed: ${e.message}`)
    }
  }

  const downloadCalendar = () => {
    const blob = new Blob([alertsToICS(alerts, station.name)], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tidely-swings-${station.id}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const surgeStatus =
    settings.surgeFeet == null ? 'Surge warnings are off.'
    : liveStatus === 'ok' && reading ? `Live gauge right now: ${diffText(reading.diff)} (${ft(reading.height)} measured).`
    : liveStatus === 'unavailable' ? 'This spot has no live gauge, so surge warnings can’t run here. The Live gauge tab offers the nearest one.'
    : liveStatus === 'loading' ? 'Checking the live gauge…'
    : liveStatus === 'error' ? 'Couldn’t reach the live gauge; retrying every 6 minutes.'
    : settings.notify && settings.push ? 'Checked every 5 minutes by the Tidely alerts server.'
    : 'Checked while the Live gauge view is open, or in the background when notifications are on.'

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
          Big swing alerts
          <select
            value={settings.mode === 'auto' ? 'auto' : String(settings.feet)}
            onChange={(e) => setSettings(e.target.value === 'auto' ? { ...settings, mode: 'auto' } : { ...settings, mode: 'custom', feet: Number(e.target.value) })}
          >
            <option value="auto">Unusually big swings for this spot</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((f) => <option key={f} value={f}>Swings of {f} ft or more</option>)}
          </select>
        </label>

        <label>
          Surge warning (live gauge vs forecast)
          <select
            value={settings.surgeFeet == null ? 'off' : String(settings.surgeFeet)}
            onChange={(e) => setSettings({ ...settings, surgeFeet: e.target.value === 'off' ? null : Number(e.target.value) })}
          >
            {SURGE_CHOICES.map((f) => <option key={f} value={f}>{f} ft or more off the forecast</option>)}
            <option value="off">Off</option>
          </select>
        </label>
        <p className="hint surge-status">{surgeStatus}</p>

        <div className="alert-buttons">
          <button type="button" className={settings.notify ? 'secondary on' : 'secondary'} onClick={toggleNotify} aria-pressed={settings.notify} disabled={busy}>
            {busy ? 'Turning on…' : settings.notify ? '🔔 Notifications on' : '🔕 Notify me'}
          </button>
          <button type="button" className="secondary ghost" onClick={downloadCalendar} disabled={!alerts.length}>📅 Add to calendar</button>
        </div>
        {settings.notify && settings.push && (
          <button type="button" className="link test-push" onClick={sendTest}>Send a test notification</button>
        )}
        {notifyMsg && <p className="hint">{notifyMsg}</p>}
        {settings.notify && settings.push && (
          <p className="hint">
            ✅ Alerts for {station.name} arrive even when Tidely is closed: about 3 hours before each big swing
            {settings.surgeFeet != null ? ', and when the live gauge passes your surge level' : ''}. Checked every 5 minutes.
            This device follows one station, the one you're viewing.
          </p>
        )}
        {settings.notify && !settings.push && (
          <p className="hint">
            While Tidely is open you'll be notified about 3 hours before each big swing
            {settings.surgeFeet != null ? ', and as soon as the live gauge passes your surge level (checked every 6 minutes)' : ''}.
            For swing reminders when it's closed, use Add to calendar.
          </p>
        )}
      </div>
    </section>
  )
}
