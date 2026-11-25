// Plan tab: "When is the water above/below X ft?" over the next 7 days.
import { useState } from 'react'
import { heightAt, offsetAt, stationDate, formatDay, formatAtStation, formatDuration, ft } from '../tides.js'
import { isNight } from '../astro.js'
import { diffText } from '../surge.js'

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

export default function Planner({ events, now, station, live }) {
  const off = (t) => offsetAt(events, t) // station offset at that moment (follows DST)
  const upcoming = events.filter((e) => e.time > now && e.time - now < 7 * 86400e3)
  const lowest = Math.min(...upcoming.map((e) => e.height))
  const highest = Math.max(...upcoming.map((e) => e.height))
  const middle = Math.round(((lowest + highest) / 2) * 2) / 2

  const [opts, setOpts] = useState(() => ({ dir: 'above', feet: middle, daylight: false, ...load() }))
  const update = (o) => { const next = { ...opts, ...o }; setOpts(next); save(next) }

  const end = new Date(now.getTime() + 7 * 86400e3)
  const allowed = opts.daylight && station?.lat != null ? (t) => !isNight(new Date(t), station.lat, station.lng, off(t)) : undefined
  const windows = findWindows(events, now, end, opts.dir, opts.feet, allowed)
  const byDay = new Map() // (Map.groupBy isn't available on older iPhones)
  for (const w of windows) {
    const day = stationDate(new Date(w.start), off(w.start))
    byDay.set(day, [...(byDay.get(day) ?? []), w])
  }
  const totalMs = windows.reduce((n, w) => n + (w.end - w.start), 0)

  return (
    <section className="panel planner">
      <h2>Tide window planner</h2>
      <p className="hint">Find when the water is high enough to launch, or low enough to walk the flats.</p>

      <div className="plan-controls">
        <span>Water</span>
        <div className="seg" role="radiogroup" aria-label="Above or below">
          {['above', 'below'].map((d) => (
            <button key={d} type="button" role="radio" aria-checked={opts.dir === d} className={opts.dir === d ? 'on' : ''} onClick={() => update({ dir: d })}>
              {d}
            </button>
          ))}
        </div>
        <div className="stepper">
          <button type="button" aria-label="Lower" onClick={() => update({ feet: Math.round((opts.feet - 0.25) * 4) / 4 })}>−</button>
          <input
            type="number"
            inputMode="decimal"
            step="0.25"
            value={opts.feet}
            onChange={(e) => e.target.value !== '' && update({ feet: Number(e.target.value) })}
            aria-label="Height in feet"
          />
          <button type="button" aria-label="Higher" onClick={() => update({ feet: Math.round((opts.feet + 0.25) * 4) / 4 })}>+</button>
          <span>ft</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={opts.daylight} onChange={(e) => update({ daylight: e.target.checked })} /> Daylight only
        </label>
      </div>

      <p className="hint">
        Next 7 days here range from {ft(lowest)} to {ft(highest)}.
        {windows.length > 0 && ` ${windows.length} window${windows.length > 1 ? 's' : ''}, ${formatDuration(totalMs)} in all.`}
      </p>

      {windows.length === 0 ? (
        <p className="calm">
          No times in the next 7 days when the water is {opts.dir} {ft(opts.feet)}
          {opts.daylight ? ' in daylight' : ''}.
        </p>
      ) : (
        [...byDay].map(([day, list]) => (
          <div key={day} className="plan-day">
            <strong>{formatDay(day)}</strong>
            <ul>
              {list.map((w) => (
                <li key={w.start}>
                  <span className="when">
                    {w.start <= now.getTime() ? 'Now' : formatAtStation(new Date(w.start), off(w.start))} – {formatAtStation(new Date(w.end), off(w.end))}
                  </span>
                  <span className="dur">{formatDuration(w.end - w.start)}</span>
                  <span className="peak">{opts.dir === 'above' ? 'peak' : 'lowest'} {ft(w.peak)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <p className="hint">
        Based on NOAA predictions (times ± about 15 min).
        {live?.diff != null && Math.abs(live.diff) >= 0.2 && ` Right now the water is ${diffText(live.diff)}, so wind may shift these windows.`}
      </p>
    </section>
  )
}
