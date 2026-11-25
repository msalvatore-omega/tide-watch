import { useEffect, useState } from 'react'
import { fetchHiLo, fetchStationInfo } from './noaa.js'
import { tideNow, tideMood, formatStationTime, formatAtStation, formatCountdown, ft } from './tides.js'
import { useLiveWater, useNearestLiveGauge, liveNow, liveMood, diffText } from './live.js'
import TideScene from './components/TideScene.jsx'
import TideChart from './components/TideChart.jsx'
import StationPicker from './components/StationPicker.jsx'
import AlertsPanel, { AlertBanner, SurgeBanner, useSwingAlerts } from './components/AlertsPanel.jsx'
import { NOTIFICATIONS_ENABLED } from './config.js'

const DEFAULT_STATION = '9414290' // San Francisco, CA
const STORAGE_KEY = 'tidewatch.station'
const MODE_KEY = 'tidewatch.mode'

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, v) => { try { localStorage.setItem(key, v) } catch { /* ignore */ } }

export default function App() {
  const params = new URLSearchParams(location.search)
  const [stationId, setStationId] = useState(() => params.get('station') || read(STORAGE_KEY) || DEFAULT_STATION)
  const [mode, setModeState] = useState(() => (params.get('mode') || read(MODE_KEY)) === 'live' ? 'live' : 'predicted')
  const [station, setStation] = useState(null)
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [reloadKey, setReloadKey] = useState(0)

  const setMode = (m) => { setModeState(m); write(MODE_KEY, m) }

  // Tick the clock every 30s so the picture and countdowns stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // Load predictions whenever the station changes (or we've run past the data we have).
  useEffect(() => {
    let cancelled = false
    setError('')
    setEvents(null)
    Promise.all([fetchHiLo(stationId), fetchStationInfo(stationId).catch(() => ({ id: stationId, name: `Station ${stationId}` }))])
      .then(([ev, info]) => {
        if (cancelled) return
        setEvents(ev)
        setStation(info)
        write(STORAGE_KEY, stationId)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [stationId, reloadKey])

  // Keep the URL shareable: ?station=…&mode=live
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('station', stationId)
    if (mode === 'live') url.searchParams.set('mode', 'live')
    else url.searchParams.delete('mode')
    history.replaceState(null, '', url)
  }, [stationId, mode])

  // Refetch once we're within a day of the end of the loaded predictions.
  useEffect(() => {
    if (events && now > events.at(-1).time - 24 * 3600e3) setReloadKey((k) => k + 1)
  }, [now, events])

  const swing = useSwingAlerts(events, now)
  const { surgeFeet } = swing.settings

  // Live gauge data: needed for the Live view, and in the background for surge notifications.
  const liveWanted = mode === 'live' || (NOTIFICATIONS_ENABLED && swing.settings.notify && surgeFeet != null)
  const liveState = useLiveWater(stationId, liveWanted)
  const liveStatus = !liveWanted ? 'idle' : liveState.stationId === stationId ? liveState.status : 'loading'
  const reading = liveStatus === 'ok' ? liveNow(liveState.data, now) : null
  const liveOk = mode === 'live' && reading != null
  const live = liveOk ? reading : null // what the Live view displays
  const noGauge = mode === 'live' && liveStatus === 'unavailable'
  const nearestGauge = useNearestLiveGauge(station, noGauge)

  const tide = events ? tideNow(events, now) : null

  // What the picture and "now" card show: the gauge reading in live mode, else the prediction.
  let view = null
  if (tide) {
    if (live) {
      const min = Math.min(tide.min, live.height)
      const max = Math.max(tide.max, live.height)
      const rising = live.trend ? live.trend === 'rising' || (live.trend === 'steady' && tide.rising) : tide.rising
      const fraction = max === min ? 0.5 : (live.height - min) / (max - min)
      view = { height: live.height, rising, fraction, min, max, mood: liveMood(live, tideMood({ fraction, rising }), surgeFeet) }
    } else {
      view = { ...tide, mood: tideMood(tide) }
    }
  }

  return (
    <main>
      <header>
        <h1>🌊 Tidely</h1>
        {!picking && (
          <button className="station" onClick={() => setPicking(true)} aria-label="Change station">
            <span className="station-name">{station ? `${station.name}${station.state ? `, ${station.state}` : ''}` : 'Loading…'}</span>
            <span className="change">Change ▾</span>
          </button>
        )}
      </header>

      <div className="mode-switch" role="radiogroup" aria-label="Tide data">
        <button role="radio" aria-checked={mode === 'predicted'} className={mode === 'predicted' ? 'on' : ''} onClick={() => setMode('predicted')}>
          🔮 Predicted
        </button>
        <button role="radio" aria-checked={mode === 'live'} className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>
          <span className={liveOk ? 'live-dot on' : 'live-dot'} /> Live gauge
        </button>
      </div>

      {picking && (
        <StationPicker
          onPick={(id) => { setStationId(id); setPicking(false) }}
          onCancel={() => setPicking(false)}
        />
      )}

      {error && (
        <div className="error" role="alert">
          Couldn't load tides: {error}
          <button className="link" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      {mode === 'live' && noGauge && (
        <div className="notice">
          <strong>📡 No live gauge at this spot.</strong> NOAA measures the water at about 300 stations; the rest have
          predictions only, so predicted tides are shown below.
          {nearestGauge && (
            <button className="secondary" onClick={() => setStationId(nearestGauge.id)}>
              Switch to {nearestGauge.name}{nearestGauge.state ? `, ${nearestGauge.state}` : ''} ({nearestGauge.miles.toFixed(1)} mi)
            </button>
          )}
        </div>
      )}
      {mode === 'live' && liveStatus === 'error' && (
        <div className="notice">📡 Couldn't reach the live gauge ({liveState.message}). Showing predicted tides; retrying every 6 minutes.</div>
      )}
      {mode === 'live' && liveStatus === 'loading' && tide && <div className="notice subtle">📡 Reading the live gauge…</div>}

      {!error && !tide && <div className="skeleton" aria-busy="true">Checking the tides…</div>}

      {tide && view && (
        <>
          <SurgeBanner reading={reading} surgeFeet={surgeFeet} onShowLive={mode === 'live' ? null : () => setMode('live')} />
          <AlertBanner alerts={swing.alerts} now={now} />
          <section className="scene-wrap">
            <TideScene
              fraction={view.fraction}
              rising={view.rising}
              stationHour={tide.stationHour}
              highLabel={`High ${ft(view.max)}`}
              lowLabel={`Low ${ft(view.min)}`}
            />
            <p className="mood">{view.mood}</p>
          </section>

          <section className="cards">
            {live ? (
              <Card
                label={<>Measured now <span className="badge">LIVE</span></>}
                big={ft(live.height)}
                sub={
                  <>
                    {live.trend === 'rising' ? '⬆️ Rising' : live.trend === 'falling' ? '⬇️ Falling' : live.trend === 'steady' ? '➡️ Steady' : ''}
                    {live.diff != null && <> · {diffText(live.diff)}</>}
                    <br />
                    <span className={live.ageMs > 30 * 60e3 ? 'stale' : ''}>
                      Reading at {formatAtStation(live.time, tide.offsetMs)} ({Math.round(live.ageMs / 60000)} min ago)
                    </span>
                  </>
                }
                accent="now"
              />
            ) : (
              <Card label="Predicted now" big={ft(tide.height)} sub={tide.rising ? '⬆️ Coming in' : '⬇️ Going out'} accent="now" />
            )}
            <Card
              label={live ? 'Forecast high' : 'Next high tide'}
              big={formatStationTime(tide.nextHigh.local)}
              sub={`${ft(tide.nextHigh.height)} · ${formatCountdown(tide.nextHigh.time - now)}`}
              accent="high"
            />
            <Card
              label={live ? 'Forecast low' : 'Next low tide'}
              big={formatStationTime(tide.nextLow.local)}
              sub={`${ft(tide.nextLow.height)} · ${formatCountdown(tide.nextLow.time - now)}`}
              accent="low"
            />
          </section>

          <section className="panel">
            <h2>{live ? 'Last 18 hours: measured vs predicted' : 'Next 24 hours'}</h2>
            <TideChart events={events} now={now} offsetMs={tide.offsetMs} live={liveOk ? liveState.data : null} />
          </section>

          {station && <AlertsPanel station={station} now={now} {...swing} reading={reading} liveStatus={liveStatus} />}

          <footer>
            Times local to the station (now {formatAtStation(now, tide.offsetMs)}) · feet above MLLW ·{' '}
            <a href={`https://tidesandcurrents.noaa.gov/stationhome.html?id=${stationId}`} target="_blank" rel="noreferrer">NOAA data</a>
            {live ? ' (live readings preliminary, refreshed every 6 min)' : ''} · not for navigation
          </footer>
        </>
      )}
    </main>
  )
}

function Card({ label, big, sub, accent }) {
  return (
    <div className={`card ${accent}`}>
      <div className="label">{label}</div>
      <div className="big">{big}</div>
      <div className="sub">{sub}</div>
    </div>
  )
}
