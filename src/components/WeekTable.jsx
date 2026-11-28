// Week tab. Default view: one small tide curve per day (night shaded, HW/LW marked).
// The full table is one tap away and is what gets printed.
import Icon from './Icon.jsx'
import { Explain } from './Explain.jsx'
import { useState } from 'react'
import { heightAt, formatStationTime, formatAtStation, offsetAt, stationDate, formatDay, isClock24, hNum, ft } from '../tides.js'
import { sunTimes, moonPhase } from '../astro.js'
import { floodStage } from '../history.js'
import { MoonDisc } from './Instruments.jsx'
import { useWidth } from './useWidth.js'

const STRIP_H = 88
const TOP = 32 // room for HW labels above the curve
const BOTTOM = 30 // room for LW labels below it
const DAY = 86400e3

function DayStrip({ day, events, list, sun, dayOffset, width, lo, hi, now, isToday, bigEnds, flood }) {
  const start = Date.parse(`${day}T00:00:00Z`) - dayOffset
  const x = (t) => ((t - start) / DAY) * width
  const y = (h) => TOP + (1 - (h - lo) / (hi - lo || 1)) * (STRIP_H - TOP - BOTTOM)
  const pts = []
  for (let t = start; t <= start + DAY; t += 20 * 60e3) {
    const h = heightAt(events, new Date(t))
    if (h != null) pts.push([t, h])
  }
  if (pts.length < 2) return <svg width={width} height={STRIP_H} />
  const line = pts.map(([t, h], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(h).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts.at(-1)[0]).toFixed(1)} ${STRIP_H - BOTTOM + 6} L${x(pts[0][0]).toFixed(1)} ${STRIP_H - BOTTOM + 6} Z`
  const label = `${formatDay(day)}: ` + list.map((e) => `${e.type === 'H' ? 'high' : 'low'} water ${formatStationTime(e.local, { withDay: false })} ${ft(e.height)}`).join(', ') +
    (sun?.sunrise ? `. Sunrise ${formatAtStation(sun.sunrise, dayOffset)}, sunset ${formatAtStation(sun.sunset, dayOffset)}.` : '.')

  return (
    <svg width={width} height={STRIP_H} role="img" aria-label={label} className="strip">
      {/* night: before sunrise and after sunset */}
      {sun?.sunrise && <rect x="0" y="0" width={Math.max(0, x(sun.sunrise))} height={STRIP_H} className="strip-night" />}
      {sun?.sunset && <rect x={x(sun.sunset)} y="0" width={Math.max(0, width - x(sun.sunset))} height={STRIP_H} className="strip-night" />}
      {sun?.polar === 'night' && <rect x="0" y="0" width={width} height={STRIP_H} className="strip-night" />}
      {[6, 12, 18].map((h) => <line key={h} x1={(h / 24) * width} x2={(h / 24) * width} y1="0" y2={STRIP_H} className="strip-grid" />)}
      {flood && flood.minor <= hi && <line x1="0" x2={width} y1={y(flood.minor)} y2={y(flood.minor)} className="flood-line" />}
      <path d={area} className="strip-area" />
      <path d={line} className="strip-line" />
      {isToday && <line x1={x(now.getTime())} x2={x(now.getTime())} y1="4" y2={STRIP_H - 4} className="strip-now" />}
      {list.map((e) => {
        const ex = Math.min(width - 16, Math.max(16, x(e.time.getTime())))
        const ey = y(e.height)
        const high = e.type === 'H'
        const flooded = floodStage(e.height, flood)
        return (
          <g key={e.local} className={e.time < now ? 'strip-evt past' : 'strip-evt'}>
            {bigEnds.has(e.time.getTime()) && <circle cx={x(e.time.getTime())} cy={ey} r="7.5" className="strip-big" />}
            <circle cx={x(e.time.getTime())} cy={ey} r="4" className={flooded ? 'dot-flood' : high ? 'dot-high' : 'dot-low'} />
            <text x={ex} y={high ? ey - 20 : ey + 17} textAnchor="middle" className="strip-time">{formatStationTime(e.local, { withDay: false })}</text>
            <text x={ex} y={high ? ey - 10 : ey + 27} textAnchor="middle" className="strip-ht">{hNum(e.height)}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function WeekTable({ events, now, offsetMs, station, alerts, flood }) {
  const [view, setView] = useState('chart')
  const [ref, width] = useWidth()
  const today = stationDate(now, offsetMs)
  // Seven calendar days from today (calendar arithmetic, so a clock change can't skip or repeat a day).
  const days = []
  for (let i = 0; i < 7; i++) days.push(new Date(Date.parse(`${today}T12:00:00Z`) + i * 86400e3).toISOString().slice(0, 10))
  // Highs/lows that end an unusually large range.
  const bigEnds = new Set((alerts ?? []).map((a) => a.to.time.getTime()))

  const rows = days.map((day) => {
    const dayOffset = offsetAt(events, Date.parse(`${day}T12:00:00Z`) - offsetMs) // that day's offset (DST-aware)
    const noonUtc = new Date(Date.parse(`${day}T12:00:00Z`) - dayOffset)
    return {
      day,
      dayOffset,
      list: events.filter((e) => e.local.startsWith(day)),
      sun: station?.lat != null ? sunTimes(noonUtc, station.lat, station.lng, dayOffset) : null,
      moon: moonPhase(noonUtc),
    }
  })
  const heights = rows.flatMap((r) => r.list.map((e) => e.height))
  const lo = Math.min(...heights)
  const hi = Math.max(...heights)
  const hours = isClock24() ? ['00', '06', '12', '18', '24'] : ['12a', '6a', '12p', '6p', '12a']
  const anyFlood = rows.some((r) => r.list.some((e) => floodStage(e.height, flood)))

  return (
    <section className="panel week">
      <div className="panel-head">
        <h2>7 days</h2>
        <Explain id="week" />
        <div className="week-tools no-print">
          <div className="seg small" role="radiogroup" aria-label="View">
            {[['chart', 'chart'], ['table', 'table']].map(([v, icon]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={v === 'chart' ? 'Curves' : 'Table'} className={view === v ? 'on' : ''} onClick={() => setView(v)}><Icon name={icon} /></button>
            ))}
          </div>
          <button type="button" className="link small" onClick={() => window.print()} aria-label="Print the tide table"><Icon name="print" /></button>
        </div>
      </div>
      <p className="hint print-only">{station?.name}{station?.state ? `, ${station.state}` : ''} · heights in feet above chart datum (MLLW) · station time</p>

      <div className={view === 'chart' ? 'week-strips' : 'week-strips hidden'}>
        <div className="strip-row axis" aria-hidden="true">
          <div className="strip-day" />
          <div className="strip-axis">{hours.map((h, i) => <span key={i}>{h}</span>)}</div>
        </div>
        {rows.map((r, i) => (
          <div key={r.day} className={`strip-row${r.day === today ? ' today' : ''}${r.list.some((e) => floodStage(e.height, flood)) ? ' flood' : ''}`}>
            <div className="strip-day">
              <strong>{formatDay(r.day).split(',')[0]}</strong>
              <span>{Number(r.day.slice(8))}</span>
              <MoonDisc moon={r.moon} size={16} south={station?.lat < 0} />
            </div>
            <div className="strip-plot" ref={i === 0 ? ref : undefined}>
              {width > 0 && <DayStrip {...r} events={events} width={width} lo={lo} hi={hi} now={now} isToday={r.day === today} bigEnds={bigEnds} flood={flood} />}
            </div>
          </div>
        ))}
        <p className="legend-line" aria-hidden="true">
          <span><i className="lg dot-high-bg" /> HW</span>
          <span><i className="lg dot-low-bg" /> LW</span>
          <span><i className="lg night-bg" /> night</span>
          {bigEnds.size > 0 && <span><i className="lg big-ring" /> large range</span>}
          {anyFlood && <span><i className="lg flood-bg" /> flood stage</span>}
        </p>
      </div>

      <div className={view === 'table' ? 'week-table' : 'week-table hidden'}>
        {rows.map((r) => (
          <div key={r.day} className={r.day === today ? 'day today' : 'day'}>
            <div className="day-head">
              <strong>{formatDay(r.day)}</strong>
              <span className="day-astro">
                {r.sun?.sunrise && <><Icon name="sun" />↑ {formatAtStation(r.sun.sunrise, r.dayOffset)} · <Icon name="sun" />↓ {formatAtStation(r.sun.sunset, r.dayOffset)} </>}
                <MoonDisc moon={r.moon} size={14} south={station?.lat < 0} />
              </span>
            </div>
            <table>
              <tbody>
                {r.list.map((e) => (
                  <tr key={e.local} className={e.time < now ? 'past' : ''}>
                    <td className={e.type === 'H' ? 'hl high' : 'hl low'}>{e.type === 'H' ? '▲ HW' : '▼ LW'}</td>
                    <td>{formatStationTime(e.local, { withDay: false })}</td>
                    <td className="num">{ft(e.height)}</td>
                    <td className="flag">
                      {floodStage(e.height, flood) && <Icon name="wave" label={`${floodStage(e.height, flood)} flood stage`} />}
                      {bigEnds.has(e.time.getTime()) && <Icon name="warning" label="Ends an unusually large range" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="hint small-print"><Icon name="warning" /> ends an unusually large range{flood && <> · <Icon name="wave" /> reaches flood stage ({ft(flood.minor)})</>}</p>
      </div>
    </section>
  )
}
