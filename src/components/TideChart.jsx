import { useEffect, useRef, useState } from 'react'
import { heightAt, formatStationTime, formatAtStation, ft } from '../tides.js'

const HEIGHT = 220
const PAD = { top: 52, bottom: 56, left: 12, right: 12 }

/**
 * Tide curve with highs, lows and "now".
 * Predicted mode: 6 hours ago → 24 hours ahead.
 * Live mode (live = { observed, predicted }): 18 hours ago → 6 hours ahead, the
 * measured line drawn over NOAA's dashed 6-minute prediction.
 */
export default function TideChart({ events, now, offsetMs, live }) {
  const [ref, width] = useWidth()

  const start = new Date(now.getTime() - (live ? 18 : 6) * 3600e3)
  const end = new Date(now.getTime() + (live ? 6 : 24) * 3600e3)
  const inWindow = (p) => p.time >= start && p.time <= end
  let samples = []
  if (live) {
    samples = live.predicted.filter(inWindow).map((p) => [p.time.getTime(), p.height])
  } else {
    for (let t = start.getTime(); t <= end.getTime(); t += 10 * 60e3) {
      const h = heightAt(events, new Date(t))
      if (h != null) samples.push([t, h])
    }
  }
  const observed = live ? live.observed.filter(inWindow).map((p) => [p.time.getTime(), p.height]) : []
  const shown = events.filter(inWindow)
  if (!width || samples.length < 2) return <div ref={ref} className="chart" style={{ height: HEIGHT }} />

  const hs = [...samples, ...observed].map((s) => s[1])
  const lo = Math.min(...hs)
  const hi = Math.max(...hs)
  const x = (t) => PAD.left + ((t - start) / (end - start)) * (width - PAD.left - PAD.right)
  const y = (h) => PAD.top + (1 - (h - lo) / (hi - lo || 1)) * (HEIGHT - PAD.top - PAD.bottom)

  const toPath = (pts) => pts.map(([t, h], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(h).toFixed(1)}`).join(' ')
  const toArea = (pts, path) => `${path} L${x(pts.at(-1)[0])} ${HEIGHT - PAD.bottom} L${x(pts[0][0])} ${HEIGHT - PAD.bottom} Z`
  const line = toPath(samples)
  const obsLine = observed.length ? toPath(observed) : null
  // "Now" dot: the latest reading in live mode, the predicted curve otherwise.
  const latest = observed.at(-1)
  const nowX = latest ? x(latest[0]) : x(now.getTime())
  const nowH = latest ? latest[1] : heightAt(events, now)

  // Hour ticks every 6 hours, on the station's clock.
  const ticks = []
  const firstTick = Math.ceil((start.getTime() + offsetMs) / (6 * 3600e3)) * 6 * 3600e3 - offsetMs
  for (let t = firstTick; t <= end.getTime(); t += 6 * 3600e3) ticks.push(new Date(t))

  return (
    <div ref={ref} className="chart">
      <svg width={width} height={HEIGHT} role="img" aria-label={live ? 'Measured and predicted tide height, last 18 hours' : 'Tide height over the next 24 hours'}>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3aa0e6" stopOpacity="0.45" />
            <stop offset="1" stopColor="#3aa0e6" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="chartFillLive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e5484d" stopOpacity="0.25" />
            <stop offset="1" stopColor="#e5484d" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t.getTime()}>
            <line x1={x(t)} x2={x(t)} y1={PAD.top - 8} y2={HEIGHT - 22} stroke="currentColor" opacity="0.1" />
            <text x={x(t)} y={HEIGHT - 6} textAnchor="middle" className="tick">
              {formatAtStation(t, offsetMs, { hour: 'numeric' })}
            </text>
          </g>
        ))}
        {obsLine ? (
          <>
            <path d={line} fill="none" stroke="#1d6fb3" strokeWidth="2" strokeDasharray="5 4" opacity="0.8" />
            {observed.length > 1 && <path d={toArea(observed, obsLine)} fill="url(#chartFillLive)" />}
            <path d={obsLine} fill="none" stroke="#e5484d" strokeWidth="2.5" />
            <g className="legend">
              <line x1="4" x2="22" y1="10" y2="10" stroke="#e5484d" strokeWidth="2.5" />
              <text x="26" y="14">Measured</text>
              <line x1="96" x2="114" y1="10" y2="10" stroke="#1d6fb3" strokeWidth="2" strokeDasharray="5 4" />
              <text x="118" y="14">Predicted</text>
            </g>
          </>
        ) : (
          <>
            <path d={toArea(samples, line)} fill="url(#chartFill)" />
            <path d={line} fill="none" stroke="#1d6fb3" strokeWidth="2.5" />
          </>
        )}
        {shown.map((e) => {
          const ex = x(e.time)
          const anchor = ex < 50 ? 'start' : ex > width - 50 ? 'end' : 'middle'
          const ey = y(e.height)
          const above = e.type === 'H'
          return (
            <g key={e.time.getTime()}>
              <circle cx={ex} cy={ey} r="4.5" fill={above ? '#1d6fb3' : '#e2a23b'} stroke="#fff" strokeWidth="1.5" />
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
        <circle cx={nowX} cy={y(nowH)} r="6" fill="#ff4d4d" stroke="#fff" strokeWidth="2" />
        <text x={nowX} y={14} textAnchor="middle" className="evt now">{live ? 'Latest' : 'Now'}</text>
      </svg>
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
