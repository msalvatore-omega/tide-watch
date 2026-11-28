import { useEffect, useRef, useState } from 'react'
import { heightAt, seriesAt, offsetAt, formatStationTime, formatAtStation, ft, hNum, isMetric } from '../tides.js'
import { sunTimes } from '../astro.js'
import Icon from './Icon.jsx'

const PAD = { top: 44, bottom: 50, left: 6, right: 14 }
const GAUGE_W = 58
const PAST_H = 9
const SCREEN_H = 33 // hours across one screen-width
const FUTURE_H = 7 * 24

/**
 * Tide from 9 hours ago to 7 days ahead, scrolled sideways (one screen is about 33
 * hours): the forecast (NOAA's exact 6-minute
 * predictions where loaded, else interpolated from highs/lows), with the gauge's
 * measured water drawn over it when the station has a gauge.
 */
export default function TideChart({ events, now, predicted, observed, flood, gauge = false, coords = null }) {
  const [ref, full] = useWidth()
  const scroller = useRef(null)
  const [away, setAway] = useState(false)
  // With `gauge`, a level gauge stands still at the left on the same scale as the curve.
  const PLOT_H = gauge ? 230 : 190
  // With the station's position, sunrise and sunset are marked in a strip along the foot.
  const SUN_H = coords ? 40 : 0
  const HEIGHT = PLOT_H + SUN_H
  const view = Math.max(0, full - (gauge ? GAUGE_W : 0)) // visible width of the scrolling part
  const pxPerHour = (view - PAD.left - PAD.right) / SCREEN_H
  const width = Math.round(PAD.left + PAD.right + pxPerHour * (PAST_H + FUTURE_H))

  const start = now.getTime() - PAST_H * 3600e3
  const end = now.getTime() + FUTURE_H * 3600e3
  const samples = []
  const fineEnd = predicted?.length ? predicted.at(-1).time.getTime() : 0
  for (let t = start; t <= end; t += 10 * 60e3) {
    // NOAA's 6-minute forecast where loaded, easing into the curve drawn through the
    // highs and lows over its last two hours so the join does not show.
    const fine = seriesAt(predicted, t)
    const coarse = heightAt(events, new Date(t))
    const w = fine == null ? 0 : coarse == null ? 1 : Math.min(1, (fineEnd - t) / 7200e3)
    const h = fine == null ? coarse : w * fine + (1 - w) * coarse
    if (h != null) samples.push([t, h])
  }
  const measured = (observed ?? []).filter((p) => p.time >= start).map((p) => [p.time.getTime(), p.height])
  const shown = events.filter((e) => e.time >= start && e.time <= end)
  if (view < 80 || samples.length < 2) return <div ref={ref} className="chart" style={{ height: HEIGHT }} />

  const hs = [...samples, ...measured].map((s) => s[1])
  const lo = Math.min(...hs)
  // Always show where minor flooding starts, so the gap to it is visible.
  const hi = Math.max(...hs, flood?.minor != null ? flood.minor + 0.15 : -Infinity)
  const floodLines = flood
    ? [['Minor', flood.minor], ['Moderate', flood.moderate], ['Major', flood.major]].filter(([, v]) => v != null && v <= hi)
    : []
  const x = (t) => PAD.left + ((t - start) / (end - start)) * (width - PAD.left - PAD.right)
  const y = (h) => PAD.top + (1 - (h - lo) / (hi - lo || 1)) * (PLOT_H - PAD.top - PAD.bottom)
  const toPath = (pts) => pts.map(([t, h], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(h).toFixed(1)}`).join(' ')
  const toArea = (pts, path) => `${path} L${x(pts.at(-1)[0])} ${PLOT_H - PAD.bottom} L${x(pts[0][0])} ${PLOT_H - PAD.bottom} Z`

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
    if (wall.getUTCMinutes() === 0 && wall.getUTCHours() % 6 === 0) ticks.push({ t: new Date(t), midnight: wall.getUTCHours() === 0 })
  }

  // Each sunrise and sunset in view, and the nights between them.
  const suns = []
  if (coords) {
    for (let t = start - 86400e3; t <= end + 86400e3; t += 86400e3) {
      const day = sunTimes(new Date(t), coords.lat, coords.lng, offsetAt(events, t))
      if (day.sunrise) suns.push({ type: 'sunrise', time: day.sunrise.getTime() })
      if (day.sunset) suns.push({ type: 'sunset', time: day.sunset.getTime() })
    }
    suns.sort((p, q) => p.time - q.time)
  }
  const nights = []
  for (let i = 0; i < suns.length - 1; i++) {
    if (suns[i].type === 'sunset' && suns[i + 1].type === 'sunrise') nights.push([Math.max(start, suns[i].time), Math.min(end, suns[i + 1].time)])
  }
  const sunMarks = suns.filter((m) => m.time >= start && m.time <= end)
  const sunTime = (m) => formatAtStation(new Date(m.time), offsetAt(events, m.time))
  const sunSummary = sunMarks.filter((m) => m.time > now).slice(0, 2).map((m) => `${m.type} ${sunTime(m)}`).join(', ')
  const days = Math.round(FUTURE_H / 24)
  const summary = shown.filter((e) => e.time > now).slice(0, 8)
    .map((e) => `${e.type === 'H' ? 'high water' : 'low water'} ${formatStationTime(e.local)} ${ft(e.height)}`).join(', ')
  const top = PAD.top - 8
  const bottom = PLOT_H - PAD.bottom
  const level = latest ? latest[1] : forecastNow
  const ly = level != null ? Math.min(bottom, Math.max(top, y(level))) : bottom

  return (
    <div ref={ref} className="chart chart-wide">
      {gauge && (() => {
        const step = isMetric() ? (hi - lo > 3 / 0.3048 ? 1 / 0.3048 : 0.5 / 0.3048) : hi - lo > 9 ? 2 : hi - lo > 4.5 ? 1 : 0.5
        const marks = []
        for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) marks.push(v)
        return (
          <svg className="chart-gauge" width={GAUGE_W} height={HEIGHT} aria-hidden="true">
            <rect x="8" y={top} width="18" height={bottom - top} rx="5" className="gauge-track" />
            <rect x="8" y={ly} width="18" height={bottom - ly} rx="5" className="gauge-fill" />
            {marks.map((v) => (
              <g key={v}>
                <line x1="26" x2="31" y1={y(v)} y2={y(v)} className="gauge-tick" />
                <text x="34" y={y(v) + 4} className="tick">{hNum(v).replace(/\.0+$/, '')}</text>
              </g>
            ))}
            {flood?.minor != null && flood.minor <= hi && <line x1="4" x2="30" y1={y(flood.minor)} y2={y(flood.minor)} className="flood-line" />}
            {level != null && !away && <line x1="26" x2={GAUGE_W} y1={ly} y2={ly} className="gauge-lead" />}
            <text x="8" y={bottom + 14} className="tick">{isMetric() ? 'm' : 'ft'}</text>
          </svg>
        )
      })()}
      <div
        ref={scroller}
        className="chart-scroll"
        tabIndex={0}
        role="group"
        aria-label={`Tide graph. Scroll sideways to see the next ${days} days.`}
        onScroll={(e) => setAway(e.currentTarget.scrollLeft > view * 0.35)}
      >
      <svg width={width} height={HEIGHT} role="img" aria-label={`Height of tide, observed and predicted, from 9 hours ago to ${days} days ahead. Next: ${summary}.${sunSummary ? ` Then ${sunSummary}.` : ''}`}>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3aa0e6" stopOpacity="0.4" />
            <stop offset="1" stopColor="#3aa0e6" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {nights.filter(([from, to]) => to > from).map(([from, to]) => (
          <rect key={from} x={x(from)} y={top} width={x(to) - x(from)} height={bottom - top} className="night-band" />
        ))}
        {ticks.map(({ t, midnight }) => (
          <g key={t.getTime()}>
            <line x1={x(t)} x2={x(t)} y1={midnight ? 20 : top} y2={PLOT_H - 22} stroke="currentColor" opacity={midnight ? 0.28 : 0.1} />
            <text x={x(t)} y={PLOT_H - 6} textAnchor="middle" className={midnight ? 'tick day' : 'tick'}>
              {formatAtStation(t, offsetAt(events, t), midnight ? { weekday: 'short', day: 'numeric' } : { hour: 'numeric' })}
            </text>
          </g>
        ))}
        {sunMarks.map((m) => (
          <g key={m.time} className="sun-mark">
            <line x1={x(m.time)} x2={x(m.time)} y1={bottom} y2={PLOT_H + 2} />
            <Icon name={m.type} size={18} x={x(m.time) - 9} y={PLOT_H + 3} />
            <text x={x(m.time)} y={PLOT_H + 34} textAnchor="middle" className="tick sun">{sunTime(m)}</text>
          </g>
        ))}
        {floodLines.length > 0 && (
          <rect x={0} y={top} width={width} height={Math.max(0, y(flood.minor) - top)} className="flood-zone" />
        )}
        {floodLines.map(([name, v]) => (
          <line key={name} x1={0} x2={width} y1={y(v)} y2={y(v)} className="flood-line" />
        ))}
        {level != null && <line x1={0} x2={nowX} y1={ly} y2={ly} className="gauge-lead" />}
        <path d={toArea(samples, line)} fill="url(#chartFill)" />
        <path d={line} fill="none" className="line-forecast" strokeWidth="2" strokeDasharray={measured.length ? '5 4' : undefined} />
        {measured.length > 1 && <path d={toPath(measured)} fill="none" stroke="#e5484d" strokeWidth="2.5" />}
        {shown.map((e) => {
          const ex = x(e.time)
          const anchor = ex < 34 ? 'start' : ex > width - 50 ? 'end' : 'middle'
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
        <line x1={nowX} x2={nowX} y1={22} y2={PLOT_H - PAD.bottom} stroke="#ff4d4d" strokeWidth="2" strokeDasharray="4 3" />
        {forecastNow != null && <circle cx={nowX} cy={y(forecastNow)} r="4" className="dot-now-forecast" strokeWidth="2" />}
        {latest && <circle cx={x(latest[0])} cy={y(latest[1])} r="6" fill="#ff4d4d" stroke="#fff" strokeWidth="2" />}
        {!latest && forecastNow != null && <circle cx={nowX} cy={y(forecastNow)} r="6" fill="#ff4d4d" stroke="#fff" strokeWidth="2" />}
        <text x={nowX - 4} y={14} textAnchor="end" className="evt now">Now</text>
      </svg>
      </div>
      {floodLines.length > 0 && (
        <svg className="chart-over" width={view} height={HEIGHT} aria-hidden="true">
          {floodLines.map(([name, v]) => (
            <text key={name} x={view - PAD.right} y={y(v) - 4} textAnchor="end" className="flood-label">{name} flood stage {ft(v)}</text>
          ))}
        </svg>
      )}
      {away && (
        <button type="button" className="chart-now" onClick={() => scroller.current?.scrollTo({ left: 0, behavior: 'smooth' })}>
          ‹ Now
        </button>
      )}
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
