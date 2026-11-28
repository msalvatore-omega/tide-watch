// The Map tab: every tide station on a map, each gauge labelled with the height of tide
// it is reading now. Tap a station for its tide and conditions, then make it your
// station or star it.
import { lazy, Suspense, useEffect, useState } from 'react'
import { fetchAllStations, fetchLiveStations } from '../noaa.js'
import { Explain } from './Explain.jsx'

const StationMap = lazy(() => import('./StationMap.jsx')) // the map library loads only when asked for

export default function MapTab({ station, onPick, isFavorite, onToggleFavorite }) {
  const [stations, setStations] = useState(null)
  const [liveIds, setLiveIds] = useState(null)
  const [liveOnly, setLiveOnly] = useState(true)
  const [me, setMe] = useState(null)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchAllStations().then((s) => !cancelled && setStations(s)).catch((e) => !cancelled && setMessage(`Couldn't load the station list: ${e.message}`))
    fetchLiveStations().then((list) => !cancelled && setLiveIds(new Set(list.map((s) => s.id)))).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const locate = () => {
    if (!navigator.geolocation) return setMessage('Your browser does not share location.')
    setLocating(true)
    setMessage('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setLocating(false) },
      (e) => { setMessage(e.code === 1 ? 'Location permission was denied.' : `Couldn't get your location (${e.message}).`); setLocating(false) },
      { timeout: 15000, maximumAge: 600000 },
    )
  }

  const home = station?.lat != null ? { lat: station.lat, lng: station.lng } : null
  return (
    <section className="panel map-tab">
      <div className="panel-head">
        <h2>Tide gauges now</h2>
        <Explain id="map" />
      </div>
      <label className="check live-filter">
        <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} />
        Tide gauges only <span className="hint-inline">(untick to add stations with predictions only)</span>
      </label>
      {message && <p className="hint">{message}</p>}
      <Suspense fallback={<p className="hint">Loading the map…</p>}>
        {stations
          ? <StationMap tall stations={stations} liveIds={liveIds} liveOnly={liveOnly} center={me ?? home} me={me} currentId={station?.id} onLocate={locate} locating={locating} onPick={onPick} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} />
          : !message && <p className="hint">Loading stations…</p>}
      </Suspense>
    </section>
  )
}
