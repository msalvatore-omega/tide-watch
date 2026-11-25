import { useMemo, useState } from 'react'
import { fetchAllStations, distanceMiles, lookupZip } from '../noaa.js'

/** Search ~3,500 NOAA tide stations by name, state, ID or zip code, or find the nearest one. */
export default function StationPicker({ onPick, onCancel, favorites = [] }) {
  const [stations, setStations] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [nearby, setNearby] = useState(null)

  const load = () => {
    if (stations) return Promise.resolve(stations)
    return fetchAllStations()
      .then((s) => { setStations(s); return s })
      .catch((e) => { setMessage(`Couldn't load the station list: ${e.message}`); throw e })
  }

  const results = useMemo(() => {
    if (nearby) return nearby
    const q = query.trim().toLowerCase()
    if (q.length < 2) return favorites.map((f) => ({ ...f, favorite: true }))
    if (!stations) return []
    return stations
      .filter((s) => s.id.includes(q) || `${s.name} ${s.state}`.toLowerCase().includes(q))
      .slice(0, 12)
  }, [stations, query, nearby, favorites])

  const showNearest = (all, lat, lng) =>
    setNearby(
      all
        .map((s) => ({ ...s, miles: distanceMiles(lat, lng, s.lat, s.lng) }))
        .sort((a, b) => a.miles - b.miles)
        .slice(0, 8),
    )

  const findNearZip = async (zip) => {
    setBusy(true)
    setMessage(`Looking up ${zip}…`)
    try {
      const [all, where] = await Promise.all([load(), lookupZip(zip)])
      showNearest(all, where.lat, where.lng)
      setMessage(`Closest stations to ${where.place} (${zip}):`)
    } catch (e) {
      setNearby(null)
      setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }

  const findNearMe = async () => {
    if (!navigator.geolocation) return setMessage('Your browser does not share location.')
    setBusy(true)
    setMessage('Finding you…')
    try {
      const [all, pos] = await Promise.all([
        load(),
        new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000, maximumAge: 600000 })),
      ])
      setQuery('')
      showNearest(all, pos.coords.latitude, pos.coords.longitude)
      setMessage('Closest stations to you:')
    } catch (e) {
      setMessage(e.code === 1 ? 'Location permission was denied. Search by name instead.' : `Couldn't get your location (${e.message}).`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="picker">
      <div className="picker-row">
        <input
          type="search"
          inputMode="search"
          autoFocus
          placeholder="Zip code, town, or beach"
          value={query}
          onFocus={() => load().catch(() => {})}
          onChange={(e) => {
            const q = e.target.value
            setNearby(null)
            setMessage('')
            setQuery(q)
            if (/^\d{5}$/.test(q.trim())) findNearZip(q.trim())
          }}
          aria-label="Search tide stations"
        />
        <button type="button" className="secondary" onClick={findNearMe} disabled={busy}>📍 Near me</button>
      </div>
      {message && <p className="hint">{message}</p>}
      {!message && query.trim().length < 2 && favorites.length > 0 && <p className="hint">★ Your favorites</p>}
      {!stations && query.length >= 2 && !message && <p className="hint">Loading stations…</p>}
      {stations && query.trim().length >= 2 && results.length === 0 && !nearby && !message && <p className="hint">No stations match “{query}”.</p>}
      <ul className="results">
        {results.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)}>
              <span>{s.name}{s.state ? `, ${s.state}` : ''}</span>
              <small>{s.miles != null ? `${s.miles.toFixed(1)} mi` : s.favorite ? '★' : `#${s.id}`}</small>
            </button>
          </li>
        ))}
      </ul>
      {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
    </div>
  )
}
