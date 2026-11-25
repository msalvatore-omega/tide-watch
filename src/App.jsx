import { useEffect, useState } from 'react'
import { fetchHiLo, fetchStationInfo } from './noaa.js'
import { tideNow, tideMood, seriesAt, formatStationTime, formatAtStation, formatCountdown, ft } from './tides.js'
import { useSixMinute, useConditions, useNearestLiveGauge, liveNow, liveMood, diffText } from './live.js'
import { isNight, sunTimes, moonPhase } from './astro.js'
import { useFavorites } from './favorites.js'
import TideScene from './components/TideScene.jsx'
import TideChart from './components/TideChart.jsx'
import StationPicker from './components/StationPicker.jsx'
import Conditions from './components/Conditions.jsx'
import WeekTable from './components/WeekTable.jsx'
import Planner from './components/Planner.jsx'
import AlertsPanel, { AlertBanner, SurgeBanner, useSwingAlerts } from './components/AlertsPanel.jsx'

const DEFAULT_STATION = '9414290' // San Francisco, CA
const STORAGE_KEY = 'tidewatch.station'
const MAX_READING_AGE_MS = 60 * 60e3 // older gauge readings aren't shown as "now"
const TABS = [
  { id: 'now', label: '🌊 Now' },
  { id: 'week', label: '📅 Week' },
  { id: 'plan', label: '🧭 Plan' },
]

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, v) => { try { localStorage.setItem(key, v) } catch { /* ignore */ } }

export default function App() {
  const params = new URLSearchParams(location.search)
  const [stationId, setStationId] = useState(() => params.get('station') || read(STORAGE_KEY) || DEFAULT_STATION)
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'now'))
  const [station, setStation] = useState(null)
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [reloadKey, setReloadKey] = useState(0)
  const favs = useFavorites()

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

  // Shareable URL: ?station=…&tab=…
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('station', stationId)
    url.searchParams.delete('mode') // old Predicted/Live links
    if (tab === 'now') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    history.replaceState(null, '', url)
  }, [stationId, tab])

  // Refetch once we're within a day of the end of the loaded predictions.
  useEffect(() => {
    if (events && now > events.at(-1).time - 24 * 3600e3) setReloadKey((k) => k + 1)
  }, [now, events])

  const swing = useSwingAlerts(events, now)
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
    : reading ? `Gauge offline (last reading ${Math.round(reading.ageMs / 3600e3)} h ago)`
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
          onPick={(id) => { setStationId(id); setPicking(false) }}
          onCancel={() => setPicking(false)}
        />
      )}

      <div className="tabs no-print" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="error" role="alert">
          Couldn't load tides: {error}
          <button className="link" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      {!error && !tide && <div className="skeleton" aria-busy="true">Checking the tides…</div>}

      {tide && view && tab === 'now' && (
        <>
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
            source={weatherGauge?.name}
            sun={hasCoords ? sunTimes(now, station.lat, station.lng, tide.offsetMs) : null}
            moon={moonPhase(now)}
            offsetMs={tide.offsetMs}
          />

          <section className="panel">
            <h2>{hasGauge ? 'Measured vs forecast' : 'Tide forecast'}</h2>
            <TideChart events={events} now={now} offsetMs={tide.offsetMs} predicted={sixData?.predicted} observed={hasGauge ? sixData.observed : null} />
          </section>

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

      {tide && tab === 'week' && <WeekTable events={events} now={now} offsetMs={tide.offsetMs} station={station} alerts={swing.alerts} />}
      {tide && tab === 'plan' && <Planner events={events} now={now} offsetMs={tide.offsetMs} station={station} live={live} />}

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

function Card({ label, big, sub, accent }) {
  return (
    <div className={`card ${accent}`}>
      <div className="label">{label}</div>
      <div className="big">{big}</div>
      <div className="sub">{sub}</div>
    </div>
  )
}
