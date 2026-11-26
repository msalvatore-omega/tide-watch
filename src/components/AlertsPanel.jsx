import { useEffect, useState } from 'react'
import { findAlerts, alertsToICS } from '../alerts.js'
import { formatStationTime, formatCountdown, hwlw, ft } from '../tides.js'
import { diffText, isSurge, SURGE_CHOICES, DEFAULT_SURGE_FT } from '../live.js'
import { pushSupported, needsHomeScreen, enablePush, syncPush, disablePush, sendTestPush } from '../push.js'
import { NOTIFICATIONS_ENABLED } from '../config.js'

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

const LEVEL_KEYS = ['mode', 'feet', 'surgeFeet']
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]))

/**
 * Hook: current alert list + the user's alert settings.
 * Alert levels (swing size, surge level) are saved per station, because a "big" swing
 * differs from place to place. A station you haven't set up starts with the levels you
 * chose most recently. Notification on/off applies to the whole device.
 */
export function useSwingAlerts(events, now, stationId) {
  const [saved, setSaved] = useState(() => {
    const raw = load(SETTINGS_KEY, {})
    // Older versions stored one flat set of levels: keep them as the starting point.
    return { notify: false, push: false, byStation: {}, ...raw, latest: { ...pick(DEFAULTS, LEVEL_KEYS), ...pick(raw, LEVEL_KEYS), ...raw.latest } }
  })
  const settings = { ...DEFAULTS, ...saved.latest, ...saved.byStation[stationId], notify: saved.notify, push: saved.push }
  const setSettings = (s) => {
    const levels = pick(s, LEVEL_KEYS)
    const next = { notify: s.notify, push: s.push, latest: levels, byStation: { ...saved.byStation, [stationId]: levels } }
    setSaved(next)
    store(SETTINGS_KEY, next)
  }
  const result = events ? findAlerts(events, now, settings) : null
  return { settings, setSettings, perStation: Boolean(saved.byStation[stationId]), ...result }
}

/** Banner for the top of the page when a big swing is under way or within 24 hours. */
export function AlertBanner({ alerts, now }) {
  const soon = alerts?.find((a) => a.from.time - now < 24 * 3600e3)
  if (!soon) return null
  return (
    <div className="alert-banner" role="status">
      <strong>⚠️ Large tidal range {soon.inProgress ? 'under way' : formatCountdown(soon.from.time - now)}</strong>
      <span>
        {soon.rising ? 'Rise' : 'Fall'} of {ft(soon.size)} to {hwlw(soon.to)} {formatStationTime(soon.to.local)} · {soon.ratio.toFixed(1)}× the usual range
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
        Observed {ft(reading.height)}, predicted {ft(reading.predicted)}: {reading.diff > 0 ? 'wind set-up or storm surge' : 'offshore wind blowing the water out'}.
        {onShowLive && <> <button type="button" className="link inline" onClick={onShowLive}>See live →</button></>}
      </span>
    </div>
  )
}

export default function AlertsPanel({ station, now, alerts, stats, threshold, settings, setSettings, perStation, reading, liveStatus }) {
  const [notifyMsg, setNotifyMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const supportsNotify = typeof Notification !== 'undefined' && 'serviceWorker' in navigator
  // Notifications are on hold unless switched on in config.js.
  const notifyOn = NOTIFICATIONS_ENABLED && settings.notify
  const pushOn = notifyOn && settings.push
  // With background push on, the alerts server sends everything; the in-app checks below stand down.
  const inApp = notifyOn && !settings.push

  // Keep the alerts server watching the station and settings shown here.
  const { mode, feet, surgeFeet } = settings
  useEffect(() => {
    if (!pushOn) return
    const t = setTimeout(() => {
      syncPush(station, { mode, feet, surgeFeet })
        .catch(() => enablePush(station, { mode, feet, surgeFeet })) // subscription expired: renew it
        .catch((e) => setNotifyMsg(`Couldn't update background alerts: ${e.message}`))
    }, 800)
    return () => clearTimeout(t)
  }, [station, mode, feet, surgeFeet, pushOn])

  // Big swings: notify shortly before each one.
  useEffect(() => {
    if (!inApp || !canNotify() || !alerts) return
    const due = alerts.filter((a) => a.from.time - now < NOTIFY_LEAD_MS)
    for (const a of due) {
      const key = `${station.id}:${a.from.time.toISOString()}`
      if (load(NOTIFIED_KEY, {})[key]) continue
      notify(
        `🌊 Large tidal range at ${station.name}`,
        `${a.rising ? 'Rise' : 'Fall'} of ${ft(a.size)}: ${hwlw(a.from)} ${formatStationTime(a.from.local, { withDay: false })} to ${hwlw(a.to)} ${formatStationTime(a.to.local, { withDay: false })}.`,
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
      `The tide gauge reads ${Math.abs(readingDiff).toFixed(1)} ft ${dir} prediction: ${dir === 'above' ? 'wind set-up or storm surge' : 'offshore wind blowing the water out'}.`,
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
    a.download = `tidely-tidal-ranges-${station.id}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const surgeStatus =
    settings.surgeFeet == null ? 'Surge warnings are off.'
    : liveStatus === 'ok' && reading ? `Tide gauge now: ${diffText(reading.diff)} (${ft(reading.height)} observed).`
    : liveStatus === 'unavailable' ? 'This station has no tide gauge, so surge warnings can’t run here.'
    : liveStatus === 'loading' ? 'Reading the tide gauge…'
    : liveStatus === 'error' ? 'Tide gauge unreachable; retrying every 6 minutes.'
    : pushOn ? 'Checked every 5 minutes by the Tidely alerts server.'
    : 'Checked every 6 minutes while Tidely is open.'

  const shown = showAll ? alerts : alerts.slice(0, 3)

  return (
    <section className="panel alerts">
      <div className="panel-head">
        <h2>Large ranges · next 7 days</h2>
        {alerts.length > 0 && (
          <button type="button" className="link small" onClick={downloadCalendar}>📅 Add to calendar</button>
        )}
      </div>

      {alerts.length === 0 ? (
        <p className="calm">😌 No unusually large ranges in the next week.</p>
      ) : (
        <ul className="alert-list">
          {shown.map((a) => (
            <li key={a.from.time.toISOString()} className={a.inProgress ? 'live' : ''}>
              <div className="swing">
                <span className="size">{a.rising ? '⬆️' : '⬇️'} {ft(a.size)}</span>
                <span className="ratio">{a.ratio.toFixed(1)}× usual</span>
              </div>
              <div className="when">
                <span>
                  <span className={a.rising ? 'g-low' : 'g-high'} aria-label={hwlw(a.from)}>{a.rising ? '▼' : '▲'}</span> {formatStationTime(a.from.local)}{' → '}
                  <span className={a.rising ? 'g-high' : 'g-low'} aria-label={hwlw(a.to)}>{a.rising ? '▲' : '▼'}</span> {formatStationTime(a.to.local, { withDay: false })}
                </span>
                <small>{a.inProgress ? 'Under way' : formatCountdown(a.from.time - now)}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
      {alerts.length > 3 && (
        <button type="button" className="link small" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${alerts.length}`}
        </button>
      )}

      <details className="alert-settings">
        <summary>⚙️ Alert settings</summary>
        <div className="alert-controls">
          <p className="hint">
            Usual range {ft(stats.typical)} · flagging {ft(threshold)} and over{settings.mode === 'auto' ? ' (largest 10%)' : ''}
          </p>
          <label>
            Large-range alerts
            <select
              value={settings.mode === 'auto' ? 'auto' : String(settings.feet)}
              onChange={(e) => setSettings(e.target.value === 'auto' ? { ...settings, mode: 'auto' } : { ...settings, mode: 'custom', feet: Number(e.target.value) })}
            >
              <option value="auto">Unusually large for this station</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((f) => <option key={f} value={f}>Ranges of {f} ft or more</option>)}
            </select>
          </label>

          <label>
            Surge warning (observed vs predicted)
            <select
              value={settings.surgeFeet == null ? 'off' : String(settings.surgeFeet)}
              onChange={(e) => setSettings({ ...settings, surgeFeet: e.target.value === 'off' ? null : Number(e.target.value) })}
            >
              {SURGE_CHOICES.map((f) => <option key={f} value={f}>{f} ft or more off prediction</option>)}
              <option value="off">Off</option>
            </select>
          </label>
          <p className="hint surge-status">{surgeStatus}</p>
          <p className="hint">
            {perStation
              ? `Saved for ${station.name}.`
              : 'Using your latest levels.'}
          </p>

          {NOTIFICATIONS_ENABLED && (
            <>
              <div className="alert-buttons">
                <button type="button" className={notifyOn ? 'secondary on' : 'secondary'} onClick={toggleNotify} aria-pressed={notifyOn} disabled={busy}>
                  {busy ? 'Turning on…' : notifyOn ? '🔔 Notifications on' : '🔕 Notify me'}
                </button>
              </div>
              {pushOn && <button type="button" className="link test-push" onClick={sendTest}>Send a test notification</button>}
              {notifyMsg && <p className="hint">{notifyMsg}</p>}
              {pushOn && (
                <p className="hint">
                  ✅ Alerts for {station.name} arrive even when Tidely is closed: about 3 hours before each large range
                  {settings.surgeFeet != null ? ', and when the tide gauge passes your surge level' : ''}. Checked every 5 minutes.
                  This device follows one station, the one you're viewing.
                </p>
              )}
              {inApp && (
                <p className="hint">
                  While Tidely is open you'll be notified about 3 hours before each large range
                  {settings.surgeFeet != null ? ', and as soon as the tide gauge passes your surge level (checked every 6 minutes)' : ''}.
                  For reminders when it's closed, use Add to calendar.
                </p>
              )}
            </>
          )}
        </div>
      </details>
    </section>
  )
}
