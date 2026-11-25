// Week tab: every high and low for 7 days, with sun and moon. Printable.
import { formatStationTime, formatAtStation, stationDate, formatDay, ft } from '../tides.js'
import { sunTimes, moonPhase } from '../astro.js'

export default function WeekTable({ events, now, offsetMs, station, alerts }) {
  const today = stationDate(now, offsetMs)
  const days = []
  for (let i = 0; i < 7; i++) days.push(stationDate(new Date(now.getTime() + i * 86400e3), offsetMs))
  // Mark highs/lows that end a big swing.
  const bigEnds = new Set((alerts ?? []).map((a) => a.to.time.getTime()))

  return (
    <section className="panel week">
      <div className="panel-head">
        <h2>Tide table · 7 days</h2>
        <button type="button" className="link small no-print" onClick={() => window.print()}>🖨️ Print</button>
      </div>
      <p className="hint print-only">{station?.name}{station?.state ? `, ${station.state}` : ''} · feet above MLLW · station local time</p>
      {days.map((day) => {
        const list = events.filter((e) => e.local.startsWith(day))
        const noonUtc = new Date(Date.parse(`${day}T12:00:00Z`) - offsetMs)
        const sun = station?.lat != null ? sunTimes(noonUtc, station.lat, station.lng, offsetMs) : null
        const moon = moonPhase(noonUtc)
        return (
          <div key={day} className={day === today ? 'day today' : 'day'}>
            <div className="day-head">
              <strong>{formatDay(day)}{day === today ? ' · Today' : ''}</strong>
              <span className="day-astro">
                {sun?.sunrise && <>🌅 {formatAtStation(sun.sunrise, offsetMs)} · 🌇 {formatAtStation(sun.sunset, offsetMs)} · </>}
                <span title={moon.name}>{moon.emoji}</span>
              </span>
            </div>
            <table>
              <tbody>
                {list.map((e) => {
                  const past = e.time < now
                  return (
                    <tr key={e.local} className={past ? 'past' : ''}>
                      <td className={e.type === 'H' ? 'hl high' : 'hl low'}>{e.type === 'H' ? '▲ High' : '▼ Low'}</td>
                      <td>{formatStationTime(e.local, { withDay: false })}</td>
                      <td className="num">{ft(e.height)}</td>
                      <td className="flag">{bigEnds.has(e.time.getTime()) ? <span title="End of a big swing">⚠️</span> : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
      <p className="hint">⚠️ ends a big swing (see alerts on the Now tab). Times are local to the station.</p>
    </section>
  )
}
