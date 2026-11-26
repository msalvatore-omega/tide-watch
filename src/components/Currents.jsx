// Currents tab, as instruments: a compass dial showing the set and drift now, and a
// flood/ebb curve for the next 24 hours with slack water and the maxima marked.
// The plain table is one tap away.
import Icon from './Icon.jsx'
import { useEffect, useMemo, useState } from 'react'
import { fetchCurrentStations, fetchCurrents, distanceMiles } from '../noaa.js'
import { currentNow, speedAt, compass, windAgainstCurrent } from '../currents.js'
import { Explain } from './Explain.jsx'
import { useWidth } from './useWidth.js'
import { offsetAt, formatAtStation, formatCountdown, stationDate, formatDay, nmText } from '../tides.js'

const CHOICE_KEY = 'tidely.currentStation.v1' // { [tideStationId]: currentStationId }
const loadChoices = () => { try { return JSON.parse(localStorage.getItem(CHOICE_KEY)) ?? {} } catch { return {} } }

const LABEL = { slack: 'Slack water', flood: 'Max flood', ebb: 'Max ebb' }

export default function Currents({ station, events: tideEvents, now, wind }) {
  const [all, setAll] = useState(null)
  const [choice, setChoice] = useState(() => loadChoices()[station?.id] ?? null)
  const [data, setData] = useState({ status: 'idle' })
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchCurrentStations().then((l) => !cancelled && setAll(l)).catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [])

  // The five nearest current stations to this tide station.
  const nearby = useMemo(() => {
    if (!all || station?.lat == null) return []
    return all
      .map((s) => ({ ...s, miles: distanceMiles(station.lat, station.lng, s.lat, s.lng) }))
      .sort((a, b) => a.miles - b.miles)
      .slice(0, 5)
  }, [all, station])
  const selected = nearby.find((s) => s.id === choice) ?? nearby[0] ?? null
  const selectedId = selected?.id
  const selectedBin = selected?.bin

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setData((d) => (d.id === selectedId ? d : { status: 'loading', id: selectedId }))
    fetchCurrents(selectedId, selectedBin)
      .then((events) => !cancelled && setData({ status: 'ok', id: selectedId, events }))
      .catch((e) => !cancelled && setData({ status: 'error', id: selectedId, message: e.message }))
    return () => { cancelled = true }
  }, [selectedId, selectedBin])

  const pick = (id) => {
    setChoice(id)
    try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ ...loadChoices(), [station.id]: id })) } catch { /* ignore */ }
  }

  if (station?.lat == null) return <section className="panel"><h2>Tidal currents</h2><p className="hint">This station has no location on record, so the nearest current station can't be found.</p></section>
  if (error) return <section className="panel"><h2>Tidal currents</h2><p className="hint">Couldn't load current stations: {error}</p></section>
  if (!all || !selected) return <section className="panel"><h2>Tidal currents</h2><p className="hint">{all ? 'No current stations found nearby.' : 'Finding the nearest current station…'}</p></section>

  const events = data.status === 'ok' && data.id === selected.id ? data.events : null
  const cur = events ? currentNow(events, now) : null
  const off = (t) => offsetAt(tideEvents, t)
  const time = (d) => formatAtStation(d, off(d))
  const upcoming = events ? events.filter((e) => e.time > now && e.time - now < 30 * 3600e3) : []
  const byDay = new Map()
  for (const e of upcoming) {
    const day = stationDate(e.time, off(e.time))
    byDay.set(day, [...(byDay.get(day) ?? []), e])
  }
  const dirText = (type, e) => {
    const d = type === 'flood' ? e.floodDir : e.ebbDir
    return d == null ? '' : `· set ${compass(d)}`
  }

  const against = cur && cur.state !== 'slack' && wind ? windAgainstCurrent(wind.deg, wind.knots, cur.dir, cur.knots) : null

  const maxKnots = Math.max(0.1, ...(events ?? []).map((e) => e.knots))

  return (
    <section className="panel currents">
      <div className="panel-head">
        <h2>Currents</h2>
        <Explain id="currents" />
        <select className="cur-select" value={selected.id} onChange={(e) => pick(e.target.value)} aria-label="Current station">
          {nearby.map((s) => (
            <option key={s.id} value={s.id}>{s.name} · {nmText(s.miles)}{s.depth != null ? ` · ${Math.round(s.depth)} ft` : ''}</option>
          ))}
        </select>
      </div>
      {selected.miles > 15 && <p className="hint"><Icon name="warning" /> {nmText(selected.miles)} away: the current here may differ.</p>}

      {data.status === 'loading' && <p className="hint">Loading current predictions…</p>}
      {data.status === 'error' && <p className="hint">Couldn't load currents: {data.message}</p>}

      {cur && (
        <>
          <div className="cur-top">
            <CurrentDial cur={cur} maxKnots={maxKnots} />
            <div className={`cur-read ${cur.state}`}>
              <div className="cur-state">{cur.state === 'slack' ? '◆ Slack' : cur.state === 'flood' ? '▲ Flood' : '▼ Ebb'}</div>
              <div className="cur-knots">{cur.knots.toFixed(1)}<span> kt</span></div>
              {cur.state !== 'slack' && cur.dir != null && <div className="cur-set">set {compass(cur.dir)} · {String(cur.dir).padStart(3, '0')}°T</div>}
              {cur.state !== 'slack' && <div className="cur-trend">{cur.building ? '↗ making' : '↘ easing'}</div>}
              {cur.nextSlack && <div className="cur-next">◆ slack {time(cur.nextSlack.time)} · {formatCountdown(cur.nextSlack.time - now).replace('in ', '')}</div>}
            </div>
          </div>

          {against && (
            <p className={`wind-tide${against.strong ? ' strong' : ''}`} role="status">
              <Icon name="wind" /> ⇄ <Icon name="wave" /> <strong>Wind against tide.</strong> {wind.dir} wind {Math.round(wind.knots)} kt is blowing against the {cur.state} current
              ({cur.knots.toFixed(1)} kt setting {compass(cur.dir)}): expect a shorter, steeper sea than the wind alone would raise{cur.nextSlack ? `, easing toward slack water at ${time(cur.nextSlack.time)}` : ''}.
            </p>
          )}

          <CurrentCurve events={events} now={now} time={time} />

          <details className="cur-details">
            <summary>☰ Table</summary>
            {[...byDay].map(([day, list]) => (
              <div key={day} className="plan-day">
                <strong>{formatDay(day)}</strong>
                <table className="cur-table">
                  <tbody>
                    {list.map((e) => (
                      <tr key={e.time.getTime()} className={e.type}>
                        <td>{time(e.time)}</td>
                        <td className="kind-cell">{LABEL[e.type]}</td>
                        <td className="num">{e.type === 'slack' ? '' : `${e.knots.toFixed(1)} kt`}</td>
                        <td className="dir">{e.type === 'slack' ? '' : compass(e.type === 'flood' ? e.floodDir : e.ebbDir)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <p className="hint small-print">
              Flood sets inshore or up the bay; ebb sets seaward. Set is the direction the current flows toward (degrees true); drift is
              its rate in knots. NOAA predictions: wind and river flow alter the real current, and slack water often does not coincide
              with high or low water.
            </p>
          </details>
        </>
      )}
      {events && !cur && <p className="hint">No current predictions for right now at this station.</p>}
    </section>
  )
}

/** Compass with an arrow pointing where the current sets; its length shows the drift. */
function CurrentDial({ cur, maxKnots }) {
  const slack = cur.state === 'slack' || cur.dir == null
  const len = 16 + 40 * Math.min(1, cur.knots / maxKnots)
  const label = slack
    ? 'Slack water: little or no current'
    : `${cur.state === 'flood' ? 'Flood' : 'Ebb'} current setting ${compass(cur.dir)}, ${cur.dir} degrees true, drift about ${cur.knots.toFixed(1)} knots, ${cur.building ? 'making' : 'easing'}`
  return (
    <svg className="cur-dial" viewBox="0 0 160 160" role="img" aria-label={label}>
      <circle cx="80" cy="80" r="62" className="inst-ring" />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1="80" y1="18" x2="80" y2={i % 3 ? 23 : 27} className="inst-tick" transform={`rotate(${i * 30} 80 80)`} />)}
      {[['N', 80, 13], ['E', 151, 84], ['S', 80, 156], ['W', 9, 84]].map(([t, x, y]) => <text key={t} x={x} y={y} textAnchor="middle" className="cur-card">{t}</text>)}
      {!slack && (
        <g transform={`rotate(${cur.dir} 80 80)`} className={`cur-arrow ${cur.state}`}>
          <line x1="80" y1={80 + len * 0.45} x2="80" y2={80 - len + 12} />
          <polygon points={`80,${80 - len - 4} 69,${80 - len + 16} 91,${80 - len + 16}`} />
        </g>
      )}
      <circle cx="80" cy="80" r={slack ? 9 : 5} className={`cur-hub ${cur.state}`} />
    </svg>
  )
}

const CURVE_H = 132

/** Flood (above the line) and ebb (below) over the next 24 hours. */
function CurrentCurve({ events, now, time }) {
  const [ref, width] = useWidth()
  const start = now.getTime() - 2 * 3600e3
  const end = now.getTime() + 24 * 3600e3
  const pts = []
  for (let t = start; t <= end; t += 10 * 60e3) {
    const v = speedAt(events, new Date(t))
    if (v != null) pts.push([t, v])
  }
  const peak = Math.max(0.1, ...pts.map((p) => Math.abs(p[1])))
  const mid = CURVE_H / 2
  const x = (t) => ((t - start) / (end - start)) * width
  const y = (v) => mid - (v / peak) * (mid - 30)
  const line = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const marks = events.filter((e) => e.time.getTime() >= start && e.time.getTime() <= end)
  return (
    <div ref={ref} className="cur-curve" role="img" aria-label={'Current over the next 24 hours: ' + marks.filter((e) => e.time > now).map((e) => `${e.type === 'slack' ? 'slack water' : `maximum ${e.type} ${e.knots.toFixed(1)} knots`} at ${time(e.time)}`).join(', ')}>
      {width > 0 && pts.length > 1 && (
        <svg width={width} height={CURVE_H} aria-hidden="true">
          <defs>
            <clipPath id="cur-up"><rect x="0" y="0" width={width} height={mid} /></clipPath>
            <clipPath id="cur-down"><rect x="0" y={mid} width={width} height={mid} /></clipPath>
          </defs>
          <path d={`${line} L${x(pts.at(-1)[0])} ${mid} L${x(pts[0][0])} ${mid} Z`} className="cur-fill flood" clipPath="url(#cur-up)" />
          <path d={`${line} L${x(pts.at(-1)[0])} ${mid} L${x(pts[0][0])} ${mid} Z`} className="cur-fill ebb" clipPath="url(#cur-down)" />
          <line x1="0" x2={width} y1={mid} y2={mid} className="cur-axis" />
          <path d={line} className="cur-line" />
          <text x={width - 4} y="12" textAnchor="end" className="cur-side flood">▲ flood</text>
          <text x={width - 4} y={CURVE_H - 4} textAnchor="end" className="cur-side ebb">▼ ebb</text>
          {marks.map((e) => {
            const ex = x(e.time.getTime())
            const tx = Math.min(width - 18, Math.max(18, ex))
            if (e.type === 'slack') {
              return (
                <g key={e.time.getTime()}>
                  <rect x={ex - 4} y={mid - 4} width="8" height="8" transform={`rotate(45 ${ex} ${mid})`} className="cur-slack" />
                </g>
              )
            }
            const up = e.type === 'flood'
            const ey = y(up ? e.knots : -e.knots)
            return (
              <g key={e.time.getTime()}>
                <circle cx={ex} cy={ey} r="4" className={up ? 'dot-high' : 'dot-low'} stroke="#fff" strokeWidth="1.5" />
                <text x={tx} y={up ? ey - 17 : ey + 15} textAnchor="middle" className="strip-time">{time(e.time)}</text>
                <text x={tx} y={up ? ey - 7 : ey + 25} textAnchor="middle" className="strip-ht">{e.knots.toFixed(1)} kt</text>
              </g>
            )
          })}
          <line x1={x(now.getTime())} x2={x(now.getTime())} y1="6" y2={CURVE_H - 6} className="strip-now" />
        </svg>
      )}
      <p className="legend-line" aria-hidden="true">
        <span><i className="lg dot-high-bg" /> max flood</span>
        <span><i className="lg dot-low-bg" /> max ebb</span>
        <span><i className="lgl nowl" /> now</span>
        <span><i className="lg cur-slack-bg" /> slack {marks.filter((e) => e.type === 'slack' && e.time > now).slice(0, 4).map((e) => time(e.time)).join(' · ')}</span>
      </p>
    </div>
  )
}
