// Plan tab: "When is the height of tide above/below X ft?" as a picture. Drag the line
// on the tide curve to set the height; each day is a 24-hour bar with the usable
// windows filled in and night shaded. Tap a window for its times.
import { Explain } from './Explain.jsx'
import { useRef, useState } from 'react'
import { heightAt, offsetAt, stationDate, formatDay, formatAtStation, formatDuration, isClock24, ft } from '../tides.js'
import { isNight, sunTimes } from '../astro.js'
import { diffText } from '../surge.js'
import { useWidth } from './useWidth.js'

const KEY = 'tidely.planner.v1'
const STEP_MS = 6 * 60e3
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } }
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore */ } }

/**
 * Time ranges where the predicted water is above/below `feet`, sampled every 6 minutes.
 * `allowed(t)` can restrict the search (e.g. to daylight).
 */
export function findWindows(events, from, to, dir, feet, allowed = () => true) {
  const windows = []
  let cur = null
  for (let t = from.getTime(); t <= to.getTime(); t += STEP_MS) {
    const h = heightAt(events, new Date(t))
    const ok = h != null && allowed(t) && (dir === 'above' ? h >= feet : h <= feet)
    if (ok && !cur) cur = { start: t, end: t, peak: h }
    if (ok) {
      cur.end = t
      cur.peak = dir === 'above' ? Math.max(cur.peak, h) : Math.min(cur.peak, h)
    }
    if (!ok && cur) {
      if (cur.end - cur.start >= 10 * 60e3) windows.push(cur)
      cur = null
    }
  }
  if (cur && cur.end - cur.start >= 10 * 60e3) windows.push(cur)
  return windows
}

const DAY = 86400e3
const SET_H = 120
const round1 = (v) => Math.round(v * 10) / 10

/** The tide curve for the next two days with a draggable level line. */
function LevelSetter({ events, now, feet, dir, lo, hi, onChange }) {
  const [ref, width] = useWidth()
  const dragging = useRef(false)
  const start = now.getTime()
  const end = start + 2 * DAY
  const pad = 14
  const x = (t) => ((t - start) / (end - start)) * width
  const y = (h) => pad + (1 - (h - lo) / (hi - lo || 1)) * (SET_H - 2 * pad)
  const fromY = (py) => round1(Math.min(hi, Math.max(lo, lo + (1 - (py - pad) / (SET_H - 2 * pad)) * (hi - lo))))
  const pts = []
  for (let t = start; t <= end; t += 20 * 60e3) {
    const h = heightAt(events, new Date(t))
    if (h != null) pts.push([t, h])
  }
  const line = pts.map(([t, h], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(h).toFixed(1)}`).join(' ')
  const ly = y(feet)
  const move = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    onChange(fromY(e.clientY - box.top))
  }
  const key = (e) => {
    const step = e.shiftKey ? 0.5 : 0.1
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onChange(round1(Math.min(hi, feet + step))) }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(round1(Math.max(lo, feet - step))) }
  }
  return (
    <div ref={ref} className="setter">
      {width > 0 && pts.length > 1 && (
        <svg
          width={width}
          height={SET_H}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e) }}
          onPointerMove={(e) => dragging.current && move(e)}
          onPointerUp={() => { dragging.current = false }}
          onPointerCancel={() => { dragging.current = false }}
        >
          <defs>
            <clipPath id="setter-keep">
              {dir === 'above' ? <rect x="0" y="0" width={width} height={ly} /> : <rect x="0" y={ly} width={width} height={SET_H - ly} />}
            </clipPath>
          </defs>
          <path d={`${line} L${width} ${SET_H} L0 ${SET_H} Z`} className="setter-area" />
          {/* the part of the tide that meets the condition */}
          <path d={`${line} L${width} ${dir === 'above' ? SET_H : 0} L0 ${dir === 'above' ? SET_H : 0} Z`} className="setter-ok" clipPath="url(#setter-keep)" />
          <path d={line} className="strip-line" />
          <line x1="0" x2={width} y1={ly} y2={ly} className="setter-line" />
          <g
            role="slider"
            tabIndex="0"
            aria-label="Height of tide to plan for, in feet"
            aria-valuemin={lo}
            aria-valuemax={hi}
            aria-valuenow={feet}
            aria-valuetext={`${dir} ${ft(feet)}`}
            onKeyDown={key}
            className="setter-handle"
          >
            <rect x={width - 78} y={ly - 15} width="74" height="30" rx="15" />
            <text x={width - 41} y={ly + 5} textAnchor="middle">↕ {ft(feet)}</text>
          </g>
        </svg>
      )}
    </div>
  )
}

export default function Planner({ events, now, station, live }) {
  const off = (t) => offsetAt(events, t) // station offset at that moment (follows DST)
  const today = stationDate(now, off(now))
  const days = []
  for (let i = 0; i < 7; i++) days.push(new Date(Date.parse(`${today}T12:00:00Z`) + i * DAY).toISOString().slice(0, 10))
  const dayStart = (day) => Date.parse(`${day}T00:00:00Z`) - off(Date.parse(`${day}T12:00:00Z`) - off(now))
  const end = new Date(dayStart(days[6]) + DAY)

  const upcoming = events.filter((e) => e.time > now && e.time < end)
  const lowest = Math.min(...upcoming.map((e) => e.height))
  const highest = Math.max(...upcoming.map((e) => e.height))
  const middle = Math.round(((lowest + highest) / 2) * 2) / 2
  const lo = round1(lowest - 0.3)
  const hi = round1(highest + 0.3)

  const [opts, setOpts] = useState(() => ({ dir: 'above', feet: middle, daylight: false, ...load() }))
  const update = (o) => { const next = { ...opts, ...o }; setOpts(next); save(next) }
  const [picked, setPicked] = useState(null)
  const feet = Math.min(hi, Math.max(lo, opts.feet))

  const hasSun = station?.lat != null
  const allowed = opts.daylight && hasSun ? (t) => !isNight(new Date(t), station.lat, station.lng, off(t)) : undefined
  const windows = findWindows(events, now, end, opts.dir, feet, allowed)
  const totalMs = windows.reduce((n, w) => n + (w.end - w.start), 0)
  const shown = windows.find((w) => w.start === picked) ?? windows[0] ?? null
  const time = (t) => formatAtStation(new Date(t), off(t))
  const dayName = (t) => formatDay(stationDate(new Date(t), off(t))).split(',')[0]
  // e.g. "Thu 17:08 – 23:32", or "Thu 22:10 – Fri 03:40" when it runs past midnight
  const span = (w) => `${w.start <= now.getTime() ? 'Now' : `${dayName(w.start)} ${time(w.start)}`} – ${dayName(w.end) !== dayName(w.start) ? `${dayName(w.end)} ` : ''}${time(w.end)}`
  const hours = isClock24() ? ['00', '06', '12', '18', '24'] : ['12a', '6a', '12p', '6p', '12a']

  return (
    <section className="panel planner">
      <div className="panel-head">
        <h2>Tidal windows</h2>
        <Explain id="plan" />
        <span className="plan-total">{windows.length ? `${windows.length} · ${formatDuration(totalMs)}` : 'none'}</span>
      </div>

      <LevelSetter events={events} now={now} feet={feet} dir={opts.dir} lo={lo} hi={hi} onChange={(v) => update({ feet: v })} />

      <div className="plan-controls">
        <div className="seg" role="radiogroup" aria-label="Height of tide above or below the line">
          {[['above', '▲ above'], ['below', '▼ below']].map(([d, label]) => (
            <button key={d} type="button" role="radio" aria-checked={opts.dir === d} className={opts.dir === d ? 'on' : ''} onClick={() => update({ dir: d })}>{label}</button>
          ))}
        </div>
        <div className="stepper">
          <button type="button" aria-label="Lower by a tenth of a foot" onClick={() => update({ feet: round1(feet - 0.1) })}>−</button>
          <output aria-live="polite">{ft(feet)}</output>
          <button type="button" aria-label="Raise by a tenth of a foot" onClick={() => update({ feet: round1(feet + 0.1) })}>+</button>
        </div>
        {hasSun && (
          <button type="button" className={opts.daylight ? 'toggle on' : 'toggle'} aria-pressed={opts.daylight} aria-label="Daylight only" onClick={() => update({ daylight: !opts.daylight })}>☀️</button>
        )}
      </div>

      <div className="timeline">
        <div className="tl-row axis" aria-hidden="true">
          <div className="tl-day" />
          <div className="strip-axis">{hours.map((h, i) => <span key={i}>{h}</span>)}</div>
        </div>
        {days.map((day) => {
          const t0 = dayStart(day)
          const pct = (t) => Math.min(100, Math.max(0, ((t - t0) / DAY) * 100))
          const sun = hasSun ? sunTimes(new Date(t0 + DAY / 2), station.lat, station.lng, off(t0 + DAY / 2)) : null
          const segs = windows.filter((w) => w.end > t0 && w.start < t0 + DAY)
          return (
            <div key={day} className={day === today ? 'tl-row today' : 'tl-row'}>
              <div className="tl-day"><strong>{formatDay(day).split(',')[0]}</strong> {Number(day.slice(8))}</div>
              <div className="tl-bar">
                {sun?.sunrise && <div className="tl-night" style={{ left: 0, width: `${pct(sun.sunrise.getTime())}%` }} />}
                {sun?.sunset && <div className="tl-night" style={{ left: `${pct(sun.sunset.getTime())}%`, right: 0 }} />}
                {sun?.polar === 'night' && <div className="tl-night" style={{ left: 0, right: 0 }} />}
                {segs.map((w) => (
                  <button
                    key={w.start}
                    type="button"
                    className={shown === w ? 'tl-win on' : 'tl-win'}
                    style={{ left: `${pct(w.start)}%`, width: `${Math.max(1.5, pct(w.end) - pct(w.start))}%` }}
                    aria-label={`${span(w)}, ${formatDuration(w.end - w.start)}, ${opts.dir === 'above' ? 'maximum' : 'minimum'} ${ft(w.peak)}`}
                    aria-pressed={shown === w}
                    onClick={() => setPicked(w.start)}
                  />
                ))}
                {day === today && <div className="tl-now" style={{ left: `${pct(now.getTime())}%` }} />}
              </div>
            </div>
          )
        })}
      </div>

      {shown ? (
        <p className="plan-detail" aria-live="polite">
          <strong>{span(shown)}</strong>
          <span>{formatDuration(shown.end - shown.start)} · {opts.dir === 'above' ? 'max' : 'min'} {ft(shown.peak)}</span>
        </p>
      ) : (
        <p className="calm">No windows {opts.dir} {ft(feet)}{opts.daylight ? ' in daylight' : ''} this week.</p>
      )}
      <p className="hint small-print">
        Predictions ± 15 min; allow for your draft.
        {live?.diff != null && Math.abs(live.diff) >= 0.2 && ` Water now ${diffText(live.diff)}.`}
      </p>
    </section>
  )
}
