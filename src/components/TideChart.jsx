import { useEffect, useRef, useState } from 'react'
import { heightAt, seriesAt, offsetAt, formatStationTime, formatAtStation, ft } from '../tides.js'

const HEIGHT = 190
const PAD = { top: 44, bottom: 50, left: 12, right: 12 }
const PAST_H = 9
const FUTURE_H = 24

/**
 * Tide from 9 hours ago to 24 hours ahead: the forecast (NOAA's exact 6-minute
 * predictions where loaded, else interpolated from highs/lows), with the gauge's
 * measured water drawn over it when the station has a gauge.
 */
export default function TideChart({ events, now, predicted, observed, flood }) {
  const [ref, width] = useWidth()

  const start = now.getTime() - PAST_H * 3600e3
  const end = now.getTime() + FUTURE_H * 3600e3
  const samples = []
  for (let t = start; t <= end; t += 10 * 60e3) {
    const h = seriesAt(predicted, t) ?? heightAt(events, new Date(t))
    if (h != null) samples.push([t, h])
  }
  const measured = (observed ?? []).filter((p) => p.time >= start).map((p) => [p.time.getTime(), p.height])
  const shown = events.filter((e) => e.time >= start && e.time <= end)
  if (!width || samples.length < 2) return <div ref={ref} className="chart" style={{ height: HEIGHT }} />

  const hs = [...samples, ...measured].map((s) => s[1])
  const lo = Math.min(...hs)
  // Always show where minor flooding starts, so the gap to it is visible.
  const hi = Math.max(...hs, flood?.minor != null ? flood.minor + 0.15 : -Infinity)
  const floodLines = flood
    ? [['Minor', flood.minor], ['Moderate', flood.moderate], ['Major', flood.major]].filter(([, v]) => v != null && v <= hi)
    : []
  const x = (t) => PAD.left + ((t - start) / (end - start)) * (width - PAD.left - PAD.right)
  const y = (h) => PAD.top + (1 - (h - lo) / (hi - lo || 1)) * (HEIGHT - PAD.top - PAD.bottom)
  const toPath = (pts) => pts.map(([t, h], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(h).toFixed(1)}`).join(' ')
  const toArea = (pts, path) => `${path} L${x(pts.at(-1)[0])} ${HEIGHT - PAD.bottom} L${x(pts[0][0])} ${HEIGHT - PAD.bottom} Z`

  const line = toPath(samples)
  const nowX = x(now.getTime())
  const latest = measured.at(-1)
  const forecastNow = seriesAt(predicted, now.getTime()) ?? heightAt(events, now)

  // Hour ticks every 6 hours, on the station's clock.
  // (each tick uses the station offset at that moment, so they stay on 12/6 o'clock across a clock change)
  const ticks = []
  const HALF_HOUR = 30 * 60e3
  for (let t = Math.ceil(start / HALF_HOUR) * HALF_HOUR; t <= end; t += HALF_HOUR) {
    const wall = new Date(t + offsetAt(events, t))
    if (wall.getUTCMinutes() === 0 && wall.getUTCHours() % 6 === 0) ticks.push(new Date(t))
  }

  return (
    <div ref={ref} className="chart">
      <svg width={width} height={HEIGHT} role="img" aria-label="Height of tide: observed and predicted, 9 hours ago to 24 hours ahead">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3aa0e6" stopOpacity="0.4" />
            <stop offset="1" stopColor="#3aa0e6" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t.getTime()}>
            <line x1={x(t)} x2={x(t)} y1={PAD.top - 8} y2={HEIGHT - 22} stroke="currentColor" opacity="0.1" />
            <text x={x(t)} y={HEIGHT - 6} textAnchor="middle" className="tick">
              {formatAtStation(t, offsetAt(events, t), { hour: 'numeric' })}
            </text>
          </g>
        ))}
        {floodLines.length > 0 && (
          <rect x={PAD.left} y={PAD.top - 8} width={width - PAD.left - PAD.right} height={Math.max(0, y(flood.minor) - PAD.top + 8)} className="flood-zone" />
        )}
        {floodLines.map(([name, v]) => (
          <g key={name}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="flood-line" />
            <text x={width - PAD.right} y={y(v) - 4} textAnchor="end" className="flood-label">{name} flood stage {ft(v)}</text>
          </g>
        ))}
        <path d={toArea(samples, line)} fill="url(#chartFill)" />
        <path d={line} fill="none" className="line-forecast" strokeWidth="2" strokeDasharray={measured.length ? '5 4' : undefined} />
        {measured.length > 1 && <path d={toPath(measured)} fill="none" stroke="#e5484d" strokeWidth="2.5" />}
        {shown.map((e) => {
          const ex = x(e.time)
          const anchor = ex < 50 ? 'start' : ex > width - 50 ? 'end' : 'middle'
          const ey = y(e.height)
          const above = e.type === 'H'
          return (
            <g key={e.time.getTime()}>
              <circle cx={ex} cy={ey} r="4.5" className={above ? 'dot-high' : 'dot-low'} stroke="#fff" strokeWidth="1.5" />
              <text x={ex} y={above ? ey - 18 : ey + 18} textAnchor={anchor} className="evt">
                {formatStationTime(e.local, { withDay: false })}
              </text>
              <text x={ex} y={above ? ey - 6 : ey + 30} textAnchor={anchor} className="evt sub">
                {ft(e.height)}
              </text>
            </g>
          )
        })}
        <line x1={nowX} x2={nowX} y1={22} y2={HEIGHT - PAD.bottom} stroke="#ff4d4d" strokeWidth="2" strokeDasharray="4 3" />
        {forecastNow != null && <circle cx={nowX} cy={y(forecastNow)} r="4" className="dot-now-forecast" strokeWidth="2" />}
        {latest && <circle cx={x(latest[0])} cy={y(latest[1])} r="6" fill="#ff4d4d" stroke="#fff" strokeWidth="2" />}
        {!latest && forecastNow != null && <circle cx={nowX} cy={y(forecastNow)} r="6" fill="#ff4d4d" stroke="#fff" strokeWidth="2" />}
        <text x={Math.max(nowX - 4, 4)} y={14} textAnchor="end" className="evt now">Now</text>
      </svg>
      <p className="legend-line" aria-hidden="true">
        {measured.length > 0 && <span><i className="lgl obs" /> observed</span>}
        <span><i className={measured.length ? 'lgl pred dashed' : 'lgl pred'} /> predicted</span>
        <span><i className="lg dot-high-bg" /> high water</span>
        <span><i className="lg dot-low-bg" /> low water</span>
        {floodLines.length > 0 && <span><i className="lgl floodl" /> flood stage</span>}
        <span><i className="lgl nowl" /> now</span>
      </p>
    </div>
  )
}

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
