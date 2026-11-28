// Stations on a map (loaded only when the map is opened). Filled markers have a tide
// gauge; hollow ones give predictions only. Tap a marker, then "Show this station".
// Zoomed in, each gauge in view is labelled with the height of tide it is reading now.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchLevelNow } from '../noaa.js'
import { ft } from '../tides.js'

const MAX_LEVELS = 30 // gauges read at once: the nearest to the middle of the map
const ARROW = { rising: '▲', falling: '▼', steady: '◆' }
const TREND = { rising: 'rising', falling: 'falling', steady: 'steady' }

export default function StationMap({ stations, liveIds, liveOnly, center, me, focus, onLocate, locating, onPick, isFavorite, onToggleFavorite }) {
  const meLayer = useRef(null)
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const handlers = useRef({})
  const levelLayer = useRef(null)
  const [view, setView] = useState(0) // bumps when the map stops moving
  const [levels, setLevels] = useState(() => new Map()) // station id → reading, or null for none
  const [inView, setInView] = useState({ ids: [], more: false })
  const levelsRef = useRef(levels)
  levelsRef.current = levels
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
    levelLayer.current = L.layerGroup().addTo(m)
    m.on('moveend', () => setView((v) => v + 1))
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
        const reading = levelsRef.current.get(s.id)
        const level = document.createElement('span')
        level.className = 'map-pop-level'
        if (reading) level.textContent = `${ft(reading.height)}${reading.trend ? ` ${ARROW[reading.trend]} ${TREND[reading.trend]}` : ''} · observed ${Math.max(0, Math.round((Date.now() - reading.time) / 60e3))} min ago`
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
        box.append(name, kind, ...(reading ? [level] : []), row)
        return box
      })
      marker.addTo(group)
    }
  }, [stations, liveIds, liveOnly])

  // Which gauges are in view: the nearest MAX_LEVELS to the middle of the map.
  useEffect(() => {
    const m = map.current
    if (!m || !stations || !liveIds) return
    const bounds = m.getBounds()
    const mid = m.getCenter()
    const seen = stations.filter((s) => s.lat != null && liveIds.has(s.id) && bounds.contains([s.lat, s.lng]))
    const ids = seen
      .map((s) => ({ id: s.id, d: (s.lat - mid.lat) ** 2 + (s.lng - mid.lng) ** 2 }))
      .sort((a, b) => a.d - b.d).slice(0, MAX_LEVELS).map((x) => x.id)
    setInView({ ids, more: seen.length > ids.length })
  }, [view, stations, liveIds])

  // Read them, a few at a time, and again every 6 minutes while the map is open.
  const idsKey = inView.ids.join(',')
  useEffect(() => {
    if (!idsKey) return
    let cancelled = false
    const read = async () => {
      const queue = idsKey.split(',')
      const worker = async () => {
        while (queue.length && !cancelled) {
          const id = queue.shift()
          const reading = await fetchLevelNow(id).catch(() => undefined)
          if (cancelled || reading === undefined) continue
          setLevels((old) => new Map(old).set(id, reading))
        }
      }
      await Promise.all(Array.from({ length: 5 }, worker))
    }
    read()
    const timer = setInterval(read, 6 * 60e3)
    return () => { cancelled = true; clearInterval(timer) }
  }, [idsKey])

  // Label each gauge in view with its reading.
  useEffect(() => {
    const group = levelLayer.current
    if (!group || !stations) return
    group.clearLayers()
    for (const id of inView.ids) {
      const reading = levels.get(id)
      const s = reading && stations.find((x) => x.id === id)
      if (!s) continue
      const html = `<span class="map-level ${reading.trend ?? ''}">${ft(reading.height)}${reading.trend ? ` <b>${ARROW[reading.trend]}</b>` : ''}</span>`
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'map-level-icon', html, iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(group)
    }
  }, [levels, inView, stations])

  const shownLevels = inView.ids.map((id) => [stations?.find((s) => s.id === id), levels.get(id)]).filter(([s, r]) => s && r)

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
      <p className="hint small-print map-level-note" aria-live="polite">
        {!liveIds ? 'Finding the tide gauges…'
          : !inView.ids.length ? 'No tide gauges in this part of the map.'
          : shownLevels.length ? `Height of tide observed now at ${shownLevels.length} gauge${shownLevels.length === 1 ? '' : 's'}${inView.more ? ' nearest the middle; zoom in for the rest' : ''}. ▲ rising · ▼ falling · ◆ steady.`
          : 'Reading the gauges…'}
      </p>
      {/* the same readings as text, for screen readers */}
      <ul className="sr-only">
        {shownLevels.map(([s, r]) => <li key={s.id}>{s.name}: {ft(r.height)}{r.trend ? `, ${TREND[r.trend]}` : ''}</li>)}
      </ul>
      <p className="legend-line">
        <span><i className="lg map-gauge" /> Tide gauge (observed)</span>
        <span><i className="lg map-pred" /> Predictions only</span>
        {me && <span><i className="lg map-me" /> You</span>}
      </p>
    </div>
  )
}
