import { useEffect, useRef, useState } from 'react'
import { heightAt, formatStationTime, formatAtStation, ft } from '../tides.js'

const HEIGHT = 220
const PAD = { top: 52, bottom: 56, left: 12, right: 12 }

/** A smooth tide curve from 6 hours ago to 24 hours ahead, with highs, lows and "now". */
export default function TideChart({ events, now, offsetMs }) {
  const [ref, width] = useWidth()

  const start = new Date(now.getTime() - 6 * 3600e3)
  const end = new Date(now.getTime() + 24 * 3600e3)
  const samples = []
  for (let t = start.getTime(); t <= end.getTime(); t += 10 * 60e3) {
    const h = heightAt(events, new Date(t))
    if (h != null) samples.push([t, h])
  }
  const shown = events.filter((e) => e.time >= start && e.time <= end)
  if (!width || samples.length < 2) return <div ref={ref} className="chart" style={{ height: HEIGHT }} />

  const hs = samples.map((s) => s[1])
  const lo = Math.min(...hs)
  const hi = Math.max(...hs)
  const x = (t) => PAD.left + ((t - start) / (end - start)) * (width - PAD.left - PAD.right)
  const y = (h) => PAD.top + (1 - (h - lo) / (hi - lo || 1)) * (HEIGHT - PAD.top - PAD.bottom)

  const line = samples.map(([t, h], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(h).toFixed(1)}`).join(' ')
  const area = `${line} L${x(samples.at(-1)[0])} ${HEIGHT - PAD.bottom} L${x(samples[0][0])} ${HEIGHT - PAD.bottom} Z`
  const nowX = x(now.getTime())
  const nowH = heightAt(events, now)

  // Hour ticks every 6 hours, on the station's clock.
  const ticks = []
  const firstTick = Math.ceil((start.getTime() + offsetMs) / (6 * 3600e3)) * 6 * 3600e3 - offsetMs
  for (let t = firstTick; t <= end.getTime(); t += 6 * 3600e3) ticks.push(new Date(t))

  return (
    <div ref={ref} className="chart">
      <svg width={width} height={HEIGHT} role="img" aria-label="Tide height over the next 24 hours">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3aa0e6" stopOpacity="0.45" />
            <stop offset="1" stopColor="#3aa0e6" stopOpacity="0.05" />
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
        <path d={area} fill="url(#chartFill)" />
        <path d={line} fill="none" stroke="#1d6fb3" strokeWidth="2.5" />
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
        <text x={nowX} y={14} textAnchor="middle" className="evt now">Now</text>
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
