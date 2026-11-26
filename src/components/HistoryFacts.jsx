// "How unusual is this?" as a picture: a scale from the lowest to the highest water
// ever observed here, with today's height and flood stage marked. The sentences
// (last time this high/low, last flood, record dates) open on tap.
import { Explain } from './Explain.jsx'
import { ft, hNum } from '../tides.js'

const DAY = 86400e3

function formatDate(time, offsetMs, monthOnly) {
  const d = new Date(time.getTime() + offsetMs)
  return d.toLocaleDateString([], { timeZone: 'UTC', month: monthOnly ? 'long' : 'short', day: monthOnly ? undefined : 'numeric', year: 'numeric' })
}
const year = (time, offsetMs) => new Date(time.getTime() + offsetMs).getUTCFullYear()

function relative(time, now) {
  const days = (now - time) / DAY
  if (days < 1.5) return 'yesterday'
  if (days < 14) return `${Math.round(days)} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  if (days < 730) return `${Math.round(days / 30.4)} months ago`
  return `${Math.floor(days / 365.25)} years ago`
}

/** Record low … record high, with markers for now and minor flood stage. */
function RecordScale({ level, records, flood, offsetMs }) {
  const lo = records.low.height
  const hi = records.high.height
  const pct = (v) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))
  return (
    <div className="scale" role="img" aria-label={`Scale from the lowest observed water, ${ft(lo)} in ${year(records.low.time, offsetMs)}, to the highest, ${ft(hi)} in ${year(records.high.time, offsetMs)}. Now ${ft(level)}${flood ? `; minor flood stage ${ft(flood.minor)}` : ''}.`}>
      <div className="scale-bar" aria-hidden="true">
        {flood && <div className="scale-flood" style={{ left: `${pct(flood.minor)}%` }} />}
        {flood && <div className="scale-flood-tick" style={{ left: `${pct(flood.minor)}%` }}><span>flood {hNum(flood.minor)}</span></div>}
        <div className="scale-now" style={{ left: `${pct(level)}%` }}><span>{ft(level)}</span></div>
      </div>
      <div className="scale-ends" aria-hidden="true">
        <span>▼ {hNum(lo)} · {year(records.low.time, offsetMs)}</span>
        <span>{year(records.high.time, offsetMs)} · {hNum(hi)} ▲</span>
      </div>
    </div>
  )
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
    currentFact = <>{dir === 'high' ? '📈' : '📉'} <strong>The {word}est water observed since records began{records ? ` in ${records.since}` : ''}.</strong></>
  } else if (now - current.time < 3 * DAY) {
    currentFact = <>🙂 Nothing unusual: the tide last stood this {word} ({ft(level)}) {relative(current.time, now)}.</>
  } else {
    currentFact = (
      <>
        {dir === 'high' ? '📈' : '📉'} <strong>{dir === 'high' ? 'Highest' : 'Lowest'} observed water since {date(current)}</strong> ({relative(current.time, now)}),
        when it {dir === 'high' ? 'reached' : 'fell to'} {ft(current.height)}.
      </>
    )
  }

  // One-line verdict; the sentences open on tap.
  const headline = !current && !records ? 'Records'
    : !current ? `${dir === 'high' ? 'Highest' : 'Lowest'} on record`
    : now - current.time < 3 * DAY ? 'Nothing unusual'
    : `${dir === 'high' ? 'Highest' : 'Lowest'} since ${date(current)}`
  const unusual = current ? now - current.time >= 3 * DAY : Boolean(records)

  return (
    <details className="panel history">
      <summary>
        <span className="history-title">📜 History</span>
        <span className={unusual ? 'history-headline unusual' : 'history-headline'}>{headline}</span>
        {records && <RecordScale level={level} records={records} flood={flood} offsetMs={offsetMs} />}
      </summary>
      <ul className="facts">
        {currentFact && <li>{currentFact}</li>}
        {flood && (
          <li>
            {lastFlood
              ? <>🌊 Last reached flood stage ({ft(flood.minor)}) {relative(lastFlood.time, now)}, on {date(lastFlood)}: {ft(lastFlood.height)}.</>
              : records ? <>🌊 Has not reached flood stage ({ft(flood.minor)}) since records began in {records.since}.</> : <>🌊 No flood stage on record in recent months.</>}
          </li>
        )}
        {records && <li>🏆 Highest observed {ft(records.high.height)} on {date(records.high)} · lowest {ft(records.low.height)} on {date(records.low)}.</li>}
      </ul>
      <p className="hint small-print">NOAA verified observations on today's chart datum. <Explain id="history" /></p>
    </details>
  )
}
