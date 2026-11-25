// Currents tab: slack water and maximum flood/ebb at the nearest NOAA current station.
import { useEffect, useMemo, useState } from 'react'
import { fetchCurrentStations, fetchCurrents, distanceMiles } from '../noaa.js'
import { currentNow, compass } from '../currents.js'
import { offsetAt, formatAtStation, formatCountdown, stationDate, formatDay, nmText } from '../tides.js'

const CHOICE_KEY = 'tidely.currentStation.v1' // { [tideStationId]: currentStationId }
const loadChoices = () => { try { return JSON.parse(localStorage.getItem(CHOICE_KEY)) ?? {} } catch { return {} } }

const LABEL = { slack: 'Slack water', flood: 'Max flood', ebb: 'Max ebb' }

export default function Currents({ station, events: tideEvents, now }) {
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

  return (
    <section className="panel currents">
      <h2>Tidal currents</h2>
      <label className="cur-pick">
        Current station
        <select value={selected.id} onChange={(e) => pick(e.target.value)}>
          {nearby.map((s) => (
            <option key={s.id} value={s.id}>{s.name} · {nmText(s.miles)}{s.depth != null ? ` · at ${Math.round(s.depth)} ft depth` : ''}</option>
          ))}
        </select>
      </label>
      {selected.miles > 15 && (
        <p className="hint">⚠️ The nearest current station is {nmText(selected.miles)} away. The current here may be quite different.</p>
      )}

      {data.status === 'loading' && <p className="hint">Loading current predictions…</p>}
      {data.status === 'error' && <p className="hint">Couldn't load currents: {data.message}</p>}

      {cur && (
        <>
          <div className={`cur-now ${cur.state}`}>
            <div className="cur-state">
              {cur.state === 'slack' ? '⏸️ Slack water' : cur.state === 'flood' ? '➡️ Flood current' : '⬅️ Ebb current'}
            </div>
            <div className="cur-speed">
              {cur.state === 'slack'
                ? 'Little or no current at present'
                : <>{cur.dir != null ? <>Set <strong>{compass(cur.dir)} ({String(cur.dir).padStart(3, '0')}°T)</strong> · </> : ''}drift about <strong>{cur.knots.toFixed(1)} kt</strong> · {cur.building ? 'making' : 'easing'}</>}
            </div>
          </div>

          <div className="cards cur-cards">
            {cur.nextSlack && <Mini label="Next slack water" big={time(cur.nextSlack.time)} sub={formatCountdown(cur.nextSlack.time - now)} />}
            {cur.nextFlood && <Mini label="Next max flood" big={time(cur.nextFlood.time)} sub={`${cur.nextFlood.knots.toFixed(1)} kt ${dirText('flood', cur.nextFlood)}`} />}
            {cur.nextEbb && <Mini label="Next max ebb" big={time(cur.nextEbb.time)} sub={`${cur.nextEbb.knots.toFixed(1)} kt ${dirText('ebb', cur.nextEbb)}`} />}
          </div>

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
        </>
      )}
      {events && !cur && <p className="hint">No current predictions for right now at this station.</p>}
      <p className="hint small-print">
        Flood current sets inshore or up the bay; ebb sets seaward; slack water is the turn between. Set is the direction the
        current flows toward (degrees true); drift is its rate in knots. NOAA predictions: wind and river flow alter the real
        current, and slack water often does not coincide with high or low water.
      </p>
    </section>
  )
}

function Mini({ label, big, sub }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="big">{big}</div>
      <div className="sub">{sub}</div>
    </div>
  )
}
