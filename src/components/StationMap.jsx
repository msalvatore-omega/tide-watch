// Stations on a map (loaded only when the map is opened). Filled markers have a tide
// gauge; hollow ones give predictions only. Tap a marker, then "Show this station".
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function StationMap({ stations, liveIds, liveOnly, center, me, focus, onLocate, locating, onPick, isFavorite, onToggleFavorite }) {
  const meLayer = useRef(null)
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const handlers = useRef({})
  handlers.current = { onPick, isFavorite, onToggleFavorite }

  useEffect(() => {
    const m = L.map(el.current, { preferCanvas: true, zoomControl: true, attributionControl: true }).setView([center?.lat ?? 39.27, center?.lng ?? -76.58], center ? 10 : 6)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 16,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m)
    map.current = m
    layer.current = L.layerGroup().addTo(m)
    meLayer.current = L.layerGroup().addTo(m)
    return () => { m.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (center && map.current) map.current.setView([center.lat, center.lng], Math.max(map.current.getZoom(), 10))
  }, [center?.lat, center?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Your own position: a blue dot, with a ring for how sure the fix is.
  useEffect(() => {
    const group = meLayer.current
    if (!group) return
    group.clearLayers()
    if (!me) return
    if (me.accuracy > 30) L.circle([me.lat, me.lng], { radius: me.accuracy, color: '#2b7de9', weight: 1, fillColor: '#2b7de9', fillOpacity: 0.12, interactive: false }).addTo(group)
    L.circleMarker([me.lat, me.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#2b7de9', fillOpacity: 1 }).bindPopup('You are here').addTo(group)
  }, [me])

  // Searching by name: frame the matching stations.
  const focusKey = (focus ?? []).map((s) => s.id).join(',')
  useEffect(() => {
    const pts = (focus ?? []).filter((s) => s.lat != null && s.lng != null).map((s) => [s.lat, s.lng])
    if (!map.current || !pts.length) return
    if (pts.length === 1) map.current.setView(pts[0], 11)
    else map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 11 })
  }, [focusKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const group = layer.current
    if (!group || !stations) return
    group.clearLayers()
    // Gauges are drawn last so they sit on top.
    const ordered = [...stations].sort((a, b) => Number(liveIds?.has(a.id) ?? false) - Number(liveIds?.has(b.id) ?? false))
    for (const s of ordered) {
      if (s.lat == null || s.lng == null) continue
      const live = liveIds?.has(s.id)
      if (liveOnly && !live) continue
      const marker = L.circleMarker([s.lat, s.lng], live
        ? { radius: 8, color: '#fff', weight: 2, fillColor: '#c2272d', fillOpacity: 1 }
        : { radius: 6, color: '#1d6fb3', weight: 2, fillColor: '#fff', fillOpacity: 0.9 })
      marker.bindPopup(() => {
        const { onPick, isFavorite, onToggleFavorite } = handlers.current
        const box = document.createElement('div')
        box.className = 'map-pop'
        const name = document.createElement('strong')
        name.textContent = `${s.name}${s.state ? `, ${s.state}` : ''}`
        const kind = document.createElement('span')
        kind.className = live ? 'kind live' : 'kind'
        kind.textContent = live ? '● Tide gauge' : 'Predictions only'
        const row = document.createElement('div')
        row.className = 'map-pop-row'
        const go = document.createElement('button')
        go.type = 'button'
        go.className = 'primary'
        go.textContent = 'Show this station'
        go.onclick = () => onPick(s.id)
        const star = document.createElement('button')
        star.type = 'button'
        const paint = () => {
          const fav = isFavorite(s.id)
          star.className = fav ? 'result-star on' : 'result-star'
          star.textContent = fav ? '★' : '☆'
          star.setAttribute('aria-label', fav ? `Remove ${s.name} from favorites` : `Add ${s.name} to favorites`)
          star.setAttribute('aria-pressed', String(fav))
        }
        paint()
        star.onclick = () => { onToggleFavorite(s); setTimeout(() => { const f = star.textContent === '★'; star.textContent = f ? '☆' : '★'; star.className = f ? 'result-star' : 'result-star on'; star.setAttribute('aria-pressed', String(!f)) }, 0) }
        row.append(go, star)
        box.append(name, kind, row)
        return box
      })
      marker.addTo(group)
    }
  }, [stations, liveIds, liveOnly])

  return (
    <div className="map-wrap">
      <div className="map-frame">
        <div ref={el} className="map" role="application" aria-label="Map of tide stations. The search box above lists the same stations as text." />
        {onLocate && (
          <button type="button" className="map-locate" onClick={onLocate} disabled={locating} aria-label="Show my location on the map">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </button>
        )}
      </div>
      <p className="legend-line">
        <span><i className="lg map-gauge" /> Tide gauge (observed)</span>
        <span><i className="lg map-pred" /> Predictions only</span>
        {me && <span><i className="lg map-me" /> You</span>}
      </p>
    </div>
  )
}
