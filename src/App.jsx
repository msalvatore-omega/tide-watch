import { useEffect, useState } from 'react'
import { fetchHiLo, fetchStationInfo } from './noaa.js'
import { tideNow, tideMood, formatStationTime, formatAtStation, formatCountdown, ft } from './tides.js'
import TideScene from './components/TideScene.jsx'
import TideChart from './components/TideChart.jsx'
import StationPicker from './components/StationPicker.jsx'
import AlertsPanel, { AlertBanner, useSwingAlerts } from './components/AlertsPanel.jsx'

const DEFAULT_STATION = '9414290' // San Francisco, CA
const STORAGE_KEY = 'tidewatch.station'

const readSaved = () => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } }
const save = (id) => { try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ } }

export default function App() {
  const [stationId, setStationId] = useState(() => new URLSearchParams(location.search).get('station') || readSaved() || DEFAULT_STATION)
  const [station, setStation] = useState(null)
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [reloadKey, setReloadKey] = useState(0)

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
        save(stationId)
        const url = new URL(location.href)
        url.searchParams.set('station', stationId)
        history.replaceState(null, '', url)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [stationId, reloadKey])

  // Refetch once we're within a day of the end of the loaded predictions.
  useEffect(() => {
    if (events && now > events.at(-1).time - 24 * 3600e3) setReloadKey((k) => k + 1)
  }, [now, events])

  const tide = events ? tideNow(events, now) : null
  const swing = useSwingAlerts(events, now)

  return (
    <main>
      <header>
        <h1>🌊 Tide Watch</h1>
        {!picking && (
          <button className="station" onClick={() => setPicking(true)} aria-label="Change station">
            <span className="station-name">{station ? `${station.name}${station.state ? `, ${station.state}` : ''}` : 'Loading…'}</span>
            <span className="change">Change ▾</span>
          </button>
        )}
      </header>

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

      {!error && !tide && <div className="skeleton" aria-busy="true">Checking the tides…</div>}

      {tide && (
        <>
          <AlertBanner alerts={swing.alerts} now={now} />
          <section className="scene-wrap">
            <TideScene
              fraction={tide.fraction}
              rising={tide.rising}
              stationHour={tide.stationHour}
              highLabel={`High ${ft(tide.max)}`}
              lowLabel={`Low ${ft(tide.min)}`}
            />
            <p className="mood">{tideMood(tide)}</p>
          </section>

          <section className="cards">
            <Card label="Right now" big={ft(tide.height)} sub={tide.rising ? '⬆️ Coming in' : '⬇️ Going out'} accent="now" />
            <Card
              label="Next high tide"
              big={formatStationTime(tide.nextHigh.local)}
              sub={`${ft(tide.nextHigh.height)} · ${formatCountdown(tide.nextHigh.time - now)}`}
              accent="high"
            />
            <Card
              label="Next low tide"
              big={formatStationTime(tide.nextLow.local)}
              sub={`${ft(tide.nextLow.height)} · ${formatCountdown(tide.nextLow.time - now)}`}
              accent="low"
            />
          </section>

          <section className="panel">
            <h2>Next 24 hours</h2>
            <TideChart events={events} now={now} offsetMs={tide.offsetMs} />
          </section>

          {station && <AlertsPanel station={station} now={now} {...swing} />}

          <footer>
            Times are local to the station (now {formatAtStation(now, tide.offsetMs)} there). Heights in feet above
            mean lower low water (MLLW). Data: <a href={`https://tidesandcurrents.noaa.gov/stationhome.html?id=${stationId}`} target="_blank" rel="noreferrer">NOAA Tides &amp; Currents</a>.
            Predictions only, not for navigation.
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
