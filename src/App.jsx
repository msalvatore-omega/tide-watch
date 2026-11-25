import { Component, useEffect, useRef, useState } from 'react'
import { fetchHiLo, fetchStationInfo } from './noaa.js'
import { tideNow, tideMood, seriesAt, stationDate, formatStationTime, formatAtStation, formatCountdown, ft } from './tides.js'
import { useSixMinute, useConditions, useNearestLiveGauge, useOnline, liveNow, liveMood, diffText } from './live.js'
import { isNight, sunTimes, moonPhase } from './astro.js'
import { useFavorites } from './favorites.js'
import { useFloodLevels, useHistoryFacts, floodStage } from './history.js'
import HistoryFacts from './components/HistoryFacts.jsx'
import TideScene from './components/TideScene.jsx'
import TideChart from './components/TideChart.jsx'
import StationPicker from './components/StationPicker.jsx'
import Conditions from './components/Conditions.jsx'
import WeekTable from './components/WeekTable.jsx'
import Planner from './components/Planner.jsx'
import AlertsPanel, { AlertBanner, SurgeBanner, useSwingAlerts } from './components/AlertsPanel.jsx'

const DEFAULT_STATION = '8574680' // Baltimore (Fort McHenry), MD
const STORAGE_KEY = 'tidewatch.station'
const MAX_READING_AGE_MS = 60 * 60e3 // older gauge readings aren't shown as "now"
const TABS = [
  { id: 'now', label: '🌊 Now' },
  { id: 'week', label: '📅 Week' },
  { id: 'plan', label: '🧭 Plan' },
]

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, v) => { try { localStorage.setItem(key, v) } catch { /* ignore */ } }

/** If something unexpected breaks, show a way back instead of a blank page. */
class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    const home = () => { location.href = location.pathname }
    return (
      <main>
        <h1>🌊 Tidely</h1>
        <div className="error" role="alert">
          Something went wrong showing this page.
          <button className="link" onClick={home}>Start over</button>
        </div>
      </main>
    )
  }
}

export default function App() {
  return <ErrorBoundary><Tidely /></ErrorBoundary>
}

function Tidely() {
  const params = new URLSearchParams(location.search)
  const [stationId, setStationId] = useState(() => params.get('station') || read(STORAGE_KEY) || DEFAULT_STATION)
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'now'))
  // Loaded data is tagged with its station, so nothing from the previous station is
  // ever shown (or favorited) after switching.
  const [stationState, setStation] = useState(null)
  const [eventsState, setEvents] = useState(null)
  const station = stationState?.id === stationId ? stationState : null
  const events = eventsState?.stationId === stationId ? eventsState.events : null
  const lastRefetch = useRef(0)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [reloadKey, setReloadKey] = useState(0)
  const favs = useFavorites()
  const online = useOnline()

  // Save favorites' predictions in the background so they're available offline.
  const favoriteIds = favs.favorites.map((f) => f.id).join(',')
  useEffect(() => {
    if (!online || !favoriteIds) return
    const timer = setTimeout(() => {
      for (const id of favoriteIds.split(',')) if (id !== stationId) fetchHiLo(id).catch(() => {})
    }, 5000)
    return () => clearTimeout(timer)
  }, [favoriteIds, online]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tick the clock every 30s so the picture and countdowns stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // High/low predictions (31 days) and station details.
  useEffect(() => {
    let cancelled = false
    setError('')
    // If the station's details can't be loaded (e.g. offline), fall back to the favorite's saved name.
    const saved = favs.favorites.find((f) => f.id === stationId)
    const fallback = { id: stationId, name: saved?.name ?? `Station ${stationId}`, state: saved?.state }
    Promise.all([fetchHiLo(stationId), fetchStationInfo(stationId).catch(() => fallback)])
      .then(([ev, info]) => {
        if (cancelled) return
        setEvents({ stationId, events: ev })
        setStation({ ...info, id: stationId })
        write(STORAGE_KEY, stationId)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [stationId, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shareable URL: ?station=…&tab=…
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('station', stationId)
    url.searchParams.delete('mode') // old Predicted/Live links
    if (tab === 'now') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    history.replaceState(null, '', url)
  }, [stationId, tab])

  // Refetch once we're within a day of the end of the loaded predictions: at most once
  // an hour and only when online, so stale saved data can't cause a reload loop.
  useEffect(() => {
    if (!events || !online || now <= events.at(-1).time - 24 * 3600e3) return
    if (Date.now() - lastRefetch.current < 3600e3) return
    lastRefetch.current = Date.now()
    setReloadKey((k) => k + 1)
  }, [now, events, online])

  const swing = useSwingAlerts(events, now, stationId)
  const { surgeFeet } = swing.settings

  // Live gauge + exact 6-minute forecast, refreshed every 6 minutes. Used whenever available.
  const six = useSixMinute(stationId)
  const sixData = six.status === 'ok' ? six.data : null
  const hasGauge = sixData?.observed.length > 0
  const noGauge = sixData != null && !hasGauge
  const reading = hasGauge ? liveNow(sixData, now) : null
  const live = reading && reading.ageMs < MAX_READING_AGE_MS ? reading : null
  const nearestGauge = useNearestLiveGauge(station, noGauge)
  const weatherGauge = hasGauge
    ? { id: stationId, name: null }
    : nearestGauge ? { id: nearestGauge.id, name: `${nearestGauge.name} (${nearestGauge.miles.toFixed(1)} mi)` } : null
  const weather = useConditions(weatherGauge?.id ?? null)

  const tide = events ? tideNow(events, now) : null
  const flood = useFloodLevels(stationId)
  const todayStart = tide ? new Date(Date.parse(`${stationDate(now, tide.offsetMs)}T00:00:00Z`) - tide.offsetMs) : null
  const historyFacts = useHistoryFacts({ stationId, enabled: Boolean(live), level: live?.height, observed: sixData?.observed, flood, todayStart, offsetMs: tide?.offsetMs })

  // Flood warning: water at flood level now, or a high tide in the next 24 hours forecast
  // to reach it (adding today's surge if the gauge is running above the forecast).
  let floodWarning = null
  if (flood && tide) {
    const surge = live?.diff > 0 ? live.diff : 0
    const nextHigh = events.find((e) => e.type === 'H' && e.time > now && e.time - now < 24 * 3600e3 && floodStage(e.height + surge, flood))
    if (live && floodStage(live.height, flood)) {
      floodWarning = { now: true, stage: floodStage(live.height, flood), height: live.height }
    } else if (nextHigh) {
      floodWarning = { event: nextHigh, stage: floodStage(nextHigh.height + surge, flood), height: nextHigh.height, withSurge: surge > 0 && !floodStage(nextHigh.height, flood) ? nextHigh.height + surge : null }
    }
  }
  const forecastNow = tide ? seriesAt(sixData?.predicted, now) ?? tide.height : null
  const hasCoords = station?.lat != null && tide

  // What the picture and "Right now" show: the gauge when it's live, else the forecast.
  let view = null
  if (tide) {
    if (live) {
      const min = Math.min(tide.min, live.height)
      const max = Math.max(tide.max, live.height)
      const rising = live.trend ? live.trend === 'rising' || (live.trend === 'steady' && tide.rising) : tide.rising
      const fraction = max === min ? 0.5 : (live.height - min) / (max - min)
      view = { height: live.height, rising, fraction, min, max, mood: liveMood(live, tideMood({ fraction, rising }), surgeFeet) }
    } else {
      const fraction = tide.max === tide.min ? 0.5 : Math.min(1, Math.max(0, (forecastNow - tide.min) / (tide.max - tide.min)))
      view = { ...tide, height: forecastNow, fraction, mood: tideMood({ ...tide, fraction }) }
    }
  }

  const gaugeNote = live ? null
    : noGauge ? (nearestGauge
      ? <>No live gauge here · <button type="button" className="link inline" onClick={() => setStationId(nearestGauge.id)}>{nearestGauge.name} has one ({nearestGauge.miles.toFixed(1)} mi)</button></>
      : 'No live gauge here')
    : reading ? `${online ? 'Gauge offline' : 'Saved data'} (last reading ${Math.round(reading.ageMs / 3600e3)} h ago)`
    : !online ? 'Offline: showing the forecast'
    : six.status === 'error' ? "Couldn't reach the live gauge"
    : six.status === 'loading' ? 'Checking the live gauge…'
    : null

  const stationLabel = station ? `${station.name}${station.state ? `, ${station.state}` : ''}` : 'Loading…'

  return (
    <main>
      <header>
        <h1>🌊 Tidely</h1>
        {!picking && (
          <div className="station-row">
            <button className="station" onClick={() => setPicking(true)} aria-label="Change station">
              <span className="station-name">{stationLabel}</span>
              <span className="change">▾</span>
            </button>
            {station && (
              <button
                type="button"
                className={favs.isFavorite(station.id) ? 'star on' : 'star'}
                onClick={() => favs.toggle(station)}
                aria-pressed={favs.isFavorite(station.id)}
                aria-label={favs.isFavorite(station.id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                {favs.isFavorite(station.id) ? '★' : '☆'}
              </button>
            )}
          </div>
        )}
      </header>

      {!picking && favs.favorites.length > 0 && (
        <nav className="fav-row no-print" aria-label="Favorite stations">
          {favs.favorites.map((f) => (
            <button key={f.id} type="button" className={f.id === stationId ? 'chip on' : 'chip'} onClick={() => setStationId(f.id)}>
              {f.name.split(',')[0]}
            </button>
          ))}
        </nav>
      )}

      {picking && (
        <StationPicker
          favorites={favs.favorites}
          isFavorite={favs.isFavorite}
          onToggleFavorite={favs.toggle}
          onPick={(id) => { setStationId(id); setPicking(false) }}
          onCancel={() => setPicking(false)}
        />
      )}

      <div className="tabs no-print" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="tab-panel" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {!online && (
        <div className="notice offline" role="status">
          📴 <strong>You're offline.</strong> Showing saved tide predictions{error ? '' : ' for this station'}; live readings and weather will return when you reconnect.
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {online ? `Couldn't load tides: ${error}` : 'This station isn\'t saved for offline use. Open it once while connected (or add it to favorites) to save it.'}
          <button className="link" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      {!error && events && !tide && (
        <div className="error" role="alert">
          The saved tide predictions for this station have run out. {online ? '' : 'Reconnect to load new ones.'}
          {online && <button className="link" onClick={() => setReloadKey((k) => k + 1)}>Reload</button>}
        </div>
      )}
      {!error && !events && <div className="skeleton" aria-busy="true">Checking the tides…</div>}

      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {tide && view && tab === 'now' && (
        <>
          {floodWarning && (
            <div className={`alert-banner flood ${floodWarning.stage}`} role="alert">
              <strong>🌊 {floodWarning.now ? `${cap(floodWarning.stage)} flooding now` : `${cap(floodWarning.stage)} flooding possible`}</strong>
              <span>
                {floodWarning.now
                  ? `Gauge reads ${ft(floodWarning.height)}; flooding starts at ${ft(flood.minor)}.`
                  : floodWarning.withSurge
                    ? `High tide ${formatStationTime(floodWarning.event.local)}: forecast ${ft(floodWarning.height)}, about ${ft(floodWarning.withSurge)} if the water stays this far above forecast. Flooding starts at ${ft(flood.minor)}.`
                    : `High tide ${formatStationTime(floodWarning.event.local)} forecast ${ft(floodWarning.height)}; flooding starts at ${ft(flood.minor)}.`}
              </span>
            </div>
          )}
          <SurgeBanner reading={live} surgeFeet={surgeFeet} />
          <AlertBanner alerts={swing.alerts} now={now} />
          <section className="scene-wrap">
            <TideScene
              fraction={view.fraction}
              rising={view.rising}
              night={hasCoords ? isNight(now, station.lat, station.lng, tide.offsetMs) : tide.stationHour < 6.5 || tide.stationHour >= 18.5}
              highLabel={`High ${ft(view.max)}`}
              lowLabel={`Low ${ft(view.min)}`}
            />
            <span className={live ? 'scene-badge live' : 'scene-badge'}>{live ? '● LIVE' : 'Forecast'}</span>
            <p className="mood">{view.mood}</p>
            <p className="sr-only">
              {live ? 'Measured' : 'Forecast'} water level {ft(view.height)}, {view.rising ? 'rising' : 'falling'}. Next high tide{' '}
              {formatStationTime(tide.nextHigh.local)} at {ft(tide.nextHigh.height)}. Next low tide {formatStationTime(tide.nextLow.local)} at {ft(tide.nextLow.height)}.
            </p>
          </section>

          <section className="cards">
            <Card
              label={live ? <>Right now <span className="badge">LIVE</span></> : 'Right now · forecast'}
              big={ft(view.height)}
              sub={
                <>
                  {live
                    ? <>{live.trend === 'rising' ? '⬆️ Rising' : live.trend === 'falling' ? '⬇️ Falling' : live.trend === 'steady' ? '➡️ Steady' : ''}{live.diff != null && <> · {diffText(live.diff)}</>}</>
                    : view.rising ? '⬆️ Coming in' : '⬇️ Going out'}
                  {(live || gaugeNote) && <br />}
                  <span className="note">
                    {live ? `Gauge reading at ${formatAtStation(live.time, tide.offsetMs)} (${Math.round(live.ageMs / 60000)} min ago)` : gaugeNote}
                  </span>
                </>
              }
              accent="now"
            />
            <Card
              label="Next high"
              big={formatStationTime(tide.nextHigh.local)}
              sub={`${ft(tide.nextHigh.height)} · ${formatCountdown(tide.nextHigh.time - now)}`}
              accent="high"
            />
            <Card
              label="Next low"
              big={formatStationTime(tide.nextLow.local)}
              sub={`${ft(tide.nextLow.height)} · ${formatCountdown(tide.nextLow.time - now)}`}
              accent="low"
            />
          </section>

          <Conditions
            weather={weather.status === 'ok' ? weather.data : null}
            now={now}
            source={weatherGauge?.name}
            sun={hasCoords ? sunTimes(now, station.lat, station.lng, tide.offsetMs) : null}
            moon={moonPhase(now)}
            offsetMs={tide.offsetMs}
          />

          <section className="panel">
            <h2>{hasGauge ? 'Measured vs forecast' : 'Tide forecast'}</h2>
            <TideChart events={events} now={now} predicted={sixData?.predicted} observed={hasGauge ? sixData.observed : null} flood={flood} />
          </section>

          {live && <HistoryFacts history={historyFacts} flood={flood} now={now} offsetMs={tide.offsetMs} />}

          {station && (
            <AlertsPanel
              station={station}
              now={now}
              {...swing}
              reading={live}
              liveStatus={live ? 'ok' : noGauge ? 'unavailable' : reading ? 'error' : six.status}
            />
          )}
        </>
      )}

      {tide && tab === 'week' && <WeekTable events={events} now={now} offsetMs={tide.offsetMs} station={station} alerts={swing.alerts} flood={flood} />}
      {tide && tab === 'plan' && <Planner events={events} now={now} station={station} live={live} />}
      </div>

      {tide && (
        <footer>
          Times local to the station (now {formatAtStation(now, tide.offsetMs)}) · feet above MLLW ·{' '}
          <a href={`https://tidesandcurrents.noaa.gov/stationhome.html?id=${stationId}`} target="_blank" rel="noreferrer">NOAA data</a>
          {hasGauge ? ' (gauge readings preliminary, refreshed every 6 min)' : ''} · not for navigation
        </footer>
      )}
    </main>
  )
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function Card({ label, big, sub, accent }) {
  return (
    <div className={`card ${accent}`}>
      <div className="label">{label}</div>
      <div className="big">{big}</div>
      <div className="sub">{sub}</div>
    </div>
  )
}
