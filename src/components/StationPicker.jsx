import { useEffect, useMemo, useState } from 'react'
import { fetchAllStations, fetchLiveStations, distanceMiles, lookupZip } from '../noaa.js'

/**
 * Search ~3,500 NOAA tide stations by name, state, ID or zip code, or find the nearest.
 * Each result shows whether it has a live gauge (measured water) or forecast only,
 * and can be starred as a favorite right from the list.
 */
export default function StationPicker({ onPick, onCancel, favorites = [], isFavorite = () => false, onToggleFavorite }) {
  const [stations, setStations] = useState(null)
  const [liveIds, setLiveIds] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [origin, setOrigin] = useState(null) // { lat, lng } for "nearest" lists
  const [liveOnly, setLiveOnly] = useState(false)

  // Which stations have a live gauge (~300); cached for a week.
  useEffect(() => {
    let cancelled = false
    fetchLiveStations().then((list) => !cancelled && setLiveIds(new Set(list.map((s) => s.id)))).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const load = () => {
    if (stations) return Promise.resolve(stations)
    return fetchAllStations()
      .then((s) => { setStations(s); return s })
      .catch((e) => { setMessage(`Couldn't load the station list: ${e.message}`); throw e })
  }

  const q = query.trim().toLowerCase()
  const showingFavorites = !origin && q.length < 2
  const results = useMemo(() => {
    const keep = (s) => !liveOnly || !liveIds || liveIds.has(s.id)
    if (origin && stations) {
      return stations
        .filter(keep)
        .map((s) => ({ ...s, miles: distanceMiles(origin.lat, origin.lng, s.lat, s.lng) }))
        .sort((a, b) => a.miles - b.miles)
        .slice(0, 8)
    }
    if (q.length < 2) return favorites.filter(keep)
    if (!stations) return []
    return stations.filter((s) => keep(s) && (s.id.includes(q) || `${s.name} ${s.state}`.toLowerCase().includes(q))).slice(0, 12)
  }, [stations, q, origin, favorites, liveOnly, liveIds])

  const findNearZip = async (zip) => {
    setBusy(true)
    setMessage(`Looking up ${zip}…`)
    try {
      const [, where] = await Promise.all([load(), lookupZip(zip)])
      setOrigin({ lat: where.lat, lng: where.lng })
      setMessage(`Closest stations to ${where.place} (${zip}):`)
    } catch (e) {
      setOrigin(null)
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
      const [, pos] = await Promise.all([
        load(),
        new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000, maximumAge: 600000 })),
      ])
      setQuery('')
      setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude })
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
            const v = e.target.value
            setOrigin(null)
            setMessage('')
            setQuery(v)
            if (/^\d{5}$/.test(v.trim())) findNearZip(v.trim())
          }}
          aria-label="Search tide stations"
        />
        <button type="button" className="secondary" onClick={findNearMe} disabled={busy}>📍 Near me</button>
      </div>

      <label className="check live-filter">
        <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} disabled={!liveIds} />
        Live gauges only <span className="hint-inline">(measured water, not just a forecast)</span>
      </label>

      {message && <p className="hint">{message}</p>}
      {!message && showingFavorites && favorites.length > 0 && <p className="hint">★ Your favorites</p>}
      {!message && showingFavorites && favorites.length === 0 && <p className="hint">Tip: tap ☆ on any result to save it as a favorite.</p>}
      {!stations && q.length >= 2 && !message && <p className="hint">Loading stations…</p>}
      {stations && !showingFavorites && results.length === 0 && !busy && (
        <p className="hint">No {liveOnly ? 'live-gauge ' : ''}stations match{origin ? ' nearby' : ` “${query}”`}.</p>
      )}

      <ul className="results">
        {results.map((s) => {
          const live = liveIds?.has(s.id)
          const fav = isFavorite(s.id)
          return (
            <li key={s.id}>
              <button type="button" className="result-main" onClick={() => onPick(s.id)}>
                <span className="result-name">{s.name}{s.state ? `, ${s.state}` : ''}</span>
                <span className="result-meta">
                  {liveIds && <span className={live ? 'kind live' : 'kind'}>{live ? '● Live gauge' : 'Forecast only'}</span>}
                  <small>{s.miles != null ? `${s.miles.toFixed(1)} mi` : `#${s.id}`}</small>
                </span>
              </button>
              {onToggleFavorite && (
                <button
                  type="button"
                  className={fav ? 'result-star on' : 'result-star'}
                  onClick={() => onToggleFavorite(s)}
                  aria-pressed={fav}
                  aria-label={fav ? `Remove ${s.name} from favorites` : `Add ${s.name} to favorites`}
                >
                  {fav ? '★' : '☆'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
    </div>
  )
}
