// "How unusual is this?" — the last time the water was this high/low, the last flood,
// and all-time records, from NOAA's verified history.
import { ft } from '../tides.js'

const DAY = 86400e3

function formatDate(time, offsetMs, monthOnly) {
  const d = new Date(time.getTime() + offsetMs)
  return d.toLocaleDateString([], { timeZone: 'UTC', month: monthOnly ? 'long' : 'short', day: monthOnly ? undefined : 'numeric', year: 'numeric' })
}

function relative(time, now) {
  const days = (now - time) / DAY
  if (days < 1.5) return 'yesterday'
  if (days < 14) return `${Math.round(days)} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  if (days < 730) return `${Math.round(days / 30.4)} months ago`
  return `${Math.floor(days / 365.25)} years ago`
}

export default function HistoryFacts({ history, flood, now, offsetMs }) {
  if (history.status === 'loading') return <div className="panel history"><p className="hint history-loading">📜 Searching records…</p></div>
  if (history.status !== 'ok') return null
  const { level, dir, current, lastFlood, records } = history.data
  const date = (r) => formatDate(r.time, offsetMs, r.monthOnly)
  const word = dir === 'high' ? 'high' : 'low'

  let currentFact
  if (!current && !records) {
    currentFact = null // no long-term records for this gauge: can't say how unusual this is
  } else if (!current) {
    currentFact = <>{dir === 'high' ? '📈' : '📉'} <strong>The {word}est water since records began{records ? ` in ${records.since}` : ''}!</strong></>
  } else if (now - current.time < 3 * DAY) {
    currentFact = <>🙂 Normal here: the water was last this {word} ({ft(level)}) {relative(current.time, now)}.</>
  } else {
    currentFact = (
      <>
        {dir === 'high' ? '📈' : '📉'} <strong>{dir === 'high' ? 'Highest' : 'Lowest'} water since {date(current)}</strong> ({relative(current.time, now)}),
        when it {dir === 'high' ? 'reached' : 'fell to'} {ft(current.height)}.
      </>
    )
  }

  // One-line summary; the details open on tap (keeps the Now tab short).
  const headline = !current && !records ? 'History and records'
    : !current ? `${dir === 'high' ? 'Highest' : 'Lowest'} water on record`
    : now - current.time < 3 * DAY ? `Normal: last this ${word} ${relative(current.time, now)}`
    : `${dir === 'high' ? 'Highest' : 'Lowest'} water since ${date(current)}`
  const unusual = !current ? Boolean(records) : now - current.time >= 3 * DAY

  return (
    <details className="panel history" open={unusual}>
      <summary><span className="history-title">📜 History</span> <span className="history-headline">{headline}</span></summary>
      <ul className="facts">
        {currentFact && <li><span className="fact-label">Right now · {ft(level)}</span>{currentFact}</li>}
        {flood && (
          <li>
            <span className="fact-label">Flooding · starts at {ft(flood.minor)}</span>
            {lastFlood
              ? <>🌊 Last reached flood level {relative(lastFlood.time, now)}, on {date(lastFlood)} ({ft(lastFlood.height)}).</>
              : records ? <>🌊 Hasn't reached flood level since records began in {records.since}.</> : <>🌊 No flood on record in recent months.</>}
          </li>
        )}
        {records && (
          <li>
            <span className="fact-label">Records since {records.since}</span>
            🏆 Highest {ft(records.high.height)} on {date(records.high)} · lowest {ft(records.low.height)} on {date(records.low)}.
          </li>
        )}
      </ul>
      <p className="hint small-print">NOAA verified records, on today's tide datum (sea level has risen since early years).</p>
    </details>
  )
}
