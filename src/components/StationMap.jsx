// Stations on a map (loaded only when the map is opened). Filled markers have a tide
// gauge; hollow ones give predictions only. Tap a marker, then "Show this station".
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function StationMap({ stations, liveIds, liveOnly, center, onPick, isFavorite, onToggleFavorite }) {
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
    return () => { m.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (center && map.current) map.current.setView([center.lat, center.lng], Math.max(map.current.getZoom(), 10))
  }, [center?.lat, center?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div ref={el} className="map" role="application" aria-label="Map of tide stations. The search box above lists the same stations as text." />
      <p className="legend-line">
        <span><i className="lg map-gauge" /> Tide gauge (observed)</span>
        <span><i className="lg map-pred" /> Predictions only</span>
      </p>
    </div>
  )
}
