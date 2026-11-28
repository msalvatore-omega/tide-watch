// Stations on a map (loaded only when the map is opened). Filled markers have a tide
// gauge; hollow ones give predictions only. Tap a marker, then "Show this station".
// Zoomed in, each gauge in view is labelled with the height of tide it is reading now.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchLevelNow, fetchNextTides, fetchConditions } from '../noaa.js'
import { ft, formatCountdown, tempText } from '../tides.js'
import { diffText } from '../surge.js'

const MAX_LEVELS = 30 // gauges read at once: the nearest to the middle of the map
// A gauge is coloured by how far its reading stands above or below the prediction (feet).
const SURGE = [
  { from: 2, colour: '#8e1b1b', key: (f) => `${f(2)}+ above` },
  { from: 1, colour: '#d9480f', key: (f) => `${f(1)}+ above` },
  { from: 0.5, colour: '#e0a000', key: (f) => `${f(0.5)}+ above` },
  { from: -0.5, colour: '#2f8f5b', key: () => 'near prediction' },
  { from: -1, colour: '#4c9be8', key: (f) => `${f(0.5)}+ below` },
  { from: -Infinity, colour: '#1d4fa3', key: (f) => `${f(1)}+ below` },
]
const NO_READING = '#5b6b7b'
const surgeColour = (diff) => (diff == null ? NO_READING : SURGE.find((b) => diff >= b.from).colour)
const ARROW = { rising: '▲', falling: '▼', steady: '◆' }
const TREND = { rising: 'rising', falling: 'falling', steady: 'steady' }

export default function StationMap({ stations, liveIds, liveOnly, center, me, focus, onLocate, locating, onPick, isFavorite, onToggleFavorite, currentId = null, tall = false }) {
  const meLayer = useRef(null)
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const handlers = useRef({})
  const levelLayer = useRef(null)
  const gaugeMarkers = useRef(new Map()) // station id → its dot, to colour once it is read
  const [view, setView] = useState(0) // bumps when the map stops moving
  const [levels, setLevels] = useState(() => new Map()) // station id → reading, or null for none
  const [inView, setInView] = useState({ ids: [], more: false })
  const [crowded, setCrowded] = useState(0) // readings whose label had no room
  const levelsRef = useRef(levels)
  levelsRef.current = levels
  handlers.current = { onPick, isFavorite, onToggleFavorite }

  useEffect(() => {
    const m = L.map(el.current, { preferCanvas: true, zoomControl: true, attributionControl: true }).setView([center?.lat ?? 39.27, center?.lng ?? -76.58], center ? (tall ? 8 : 10) : 6)
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

  const firstCentre = useRef(true)
  useEffect(() => {
    if (firstCentre.current) { firstCentre.current = false; return } // the map was created there
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
    gaugeMarkers.current.clear()
    // Gauges are drawn last so they sit on top.
    const ordered = [...stations].sort((a, b) => Number(liveIds?.has(a.id) ?? false) - Number(liveIds?.has(b.id) ?? false))
    for (const s of ordered) {
      if (s.lat == null || s.lng == null) continue
      const live = liveIds?.has(s.id)
      if (liveOnly && !live) continue
      if (s.id === currentId) L.circleMarker([s.lat, s.lng], { radius: 14, color: '#12263a', weight: 3, fill: false, interactive: false }).addTo(group)
      const marker = L.circleMarker([s.lat, s.lng], live
        ? { radius: 8, color: '#fff', weight: 2, fillColor: surgeColour(levelsRef.current.get(s.id)?.diff), fillOpacity: 1 }
        : { radius: 6, color: '#1d6fb3', weight: 2, fillColor: '#fff', fillOpacity: 0.9 })
      if (live) gaugeMarkers.current.set(s.id, marker)
      // Built once each time the pop-up opens. (Leaflet asks for the content again whenever
      // the pop-up is re-measured, which happens as each detail line arrives.)
      let built = null
      marker.on('popupclose', () => { built = null })
      const build = () => {
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
        // Next high and low water, and for a gauge the weather it is reading: filled in as they arrive.
        const extra = document.createElement('div')
        extra.className = 'map-pop-extra'
        const line = (text) => { const p = document.createElement('span'); p.textContent = text; extra.append(p); if (built && marker.isPopupOpen()) marker.getPopup().update() }
        fetchNextTides(s.id).then((tides) => {
          const now = Date.now()
          const next = (type) => tides.find((e) => e.type === type && e.time > now)
          for (const e of [next('H'), next('L')].filter(Boolean).sort((a, b) => a.time - b.time)) {
            line(`${e.type === 'H' ? '▲ High water' : '▼ Low water'} ${formatCountdown(e.time - now)} · ${ft(e.height)}`)
          }
        }).catch(() => {})
        if (live) {
          fetchConditions(s.id).then((wx) => {
            const fresh = (x) => (x && (!x.time || Date.now() - x.time < 3 * 3600e3) ? x : null)
            const parts = [
              fresh(wx.wind) && `Wind ${wx.wind.dir ?? ''} ${Math.round(wx.wind.knots)} kt`.replace('  ', ' '),
              fresh(wx.airTemp) && `air ${tempText(wx.airTemp.f)}`,
              fresh(wx.waterTemp) && `sea ${tempText(wx.waterTemp.f)}`,
            ].filter(Boolean)
            if (parts.length) line(parts.join(' · '))
          }).catch(() => {})
        }
        if (reading?.diff != null) {
          const off = document.createElement('span')
          off.className = 'map-pop-surge'
          const dot = document.createElement('i')
          dot.style.background = surgeColour(reading.diff)
          off.append(dot, diffText(reading.diff).replace(/^\S/, (c) => c.toUpperCase()))
          extra.append(off)
        }
        const row = document.createElement('div')
        row.className = 'map-pop-row'
        const go = document.createElement('button')
        go.type = 'button'
        go.className = 'primary'
        go.textContent = s.id === currentId ? 'This is your station' : 'Make this my station'
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
        box.append(name, kind, ...(reading ? [level] : []), extra, row)
        return box
      }
      marker.bindPopup(() => (built ??= build()))
      marker.addTo(group)
    }
  }, [stations, liveIds, liveOnly, currentId])

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

  // Label each gauge in view with its reading. Where gauges crowd together a label
  // goes on the other side of its marker, or is left off, so labels never overlap.
  useEffect(() => {
    const group = levelLayer.current
    const m = map.current
    if (!group || !m || !stations) return
    group.clearLayers()
    const placed = []
    const clear = (r) => placed.every((q) => r.x2 < q.x1 || r.x1 > q.x2 || r.y2 < q.y1 || r.y1 > q.y2)
    // Your own station first, then the nearest to the middle of the map.
    const order = [...inView.ids].sort((a, b) => Number(b === currentId) - Number(a === currentId))
    let hidden = 0
    for (const id of order) {
      const reading = levels.get(id)
      const s = reading && stations.find((x) => x.id === id)
      if (!s) continue
      const text = ft(reading.height)
      const w = text.length * 7.4 + (reading.trend ? 30 : 16) // close enough to the drawn width
      const p = m.latLngToContainerPoint([s.lat, s.lng])
      // Try beside the dot (right, then left), then above and below it.
      const spots = {
        '': { x1: p.x + 11, x2: p.x + 11 + w, y1: p.y - 12, y2: p.y + 12 },
        left: { x1: p.x - 11 - w, x2: p.x - 11, y1: p.y - 12, y2: p.y + 12 },
        above: { x1: p.x - w / 2, x2: p.x + w / 2, y1: p.y - 35, y2: p.y - 11 },
        below: { x1: p.x - w / 2, x2: p.x + w / 2, y1: p.y + 11, y2: p.y + 35 },
      }
      const side = Object.keys(spots).find((k) => clear(spots[k]))
      if (side == null) { hidden++; continue }
      placed.push(spots[side])
      const html = `<span class="map-level ${reading.trend ?? ''} ${side}">${text}${reading.trend ? ` <b>${ARROW[reading.trend]}</b>` : ''}</span>`
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'map-level-icon', html, iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(group)
    }
    setCrowded(hidden)
  }, [levels, inView, stations, currentId])

  // Colour each gauge that has been read.
  useEffect(() => {
    for (const [id, marker] of gaugeMarkers.current) {
      const reading = levels.get(id)
      if (reading) marker.setStyle({ fillColor: surgeColour(reading.diff) })
    }
  }, [levels, stations, liveIds, liveOnly, currentId])

  const shownLevels = inView.ids.map((id) => [stations?.find((s) => s.id === id), levels.get(id)]).filter(([s, r]) => s && r)

  return (
    <div className="map-wrap">
      <div className="map-frame">
        <div ref={el} className={tall ? 'map tall' : 'map'} role="application" aria-label="Map of tide stations. The search box above lists the same stations as text." />
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
          : shownLevels.length ? `Height of tide observed now at ${shownLevels.length} gauge${shownLevels.length === 1 ? '' : 's'}${inView.more ? ' nearest the middle; zoom in for the rest' : ''}${crowded ? `. ${crowded} more ${crowded === 1 ? 'has' : 'have'} no room for a label: zoom in, or tap the gauge` : ''}. ▲ rising · ▼ falling · ◆ steady.`
          : 'Reading the gauges…'}
      </p>
      {/* the same readings as text, for screen readers */}
      <ul className="sr-only">
        {shownLevels.map(([s, r]) => <li key={s.id}>{s.name}: {ft(r.height)}{r.trend ? `, ${TREND[r.trend]}` : ''}{r.diff != null ? `, ${diffText(r.diff)}` : ''}</li>)}
      </ul>
      <p className="legend-line">
        <span>Gauge colour, observed against predicted:</span>
        {[...SURGE].reverse().map((b) => <span key={b.from}><i className="lg" style={{ background: b.colour }} /> {b.key(ft)}</span>)}
        <span><i className="lg" style={{ background: NO_READING }} /> no reading yet</span>
        {!liveOnly && <span><i className="lg map-pred" /> Predictions only</span>}
        {me && <span><i className="lg map-me" /> You</span>}
      </p>
    </div>
  )
}
