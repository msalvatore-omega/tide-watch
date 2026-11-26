// The tide dial: one instrument in place of three text cards. An arc runs from low
// water (left) to high water (right); the marker is the present height of tide; the
// centre gives the height and whether it is flooding or ebbing; the ends give the next
// LW and HW with countdowns.
import { formatStationTime, formatAtStation, formatCountdown, ft } from '../tides.js'

const CX = 180
const CY = 150
const R = 120

export default function TideDial({ tide, height, rising, live, now, note }) {
  // Position within the present half-tide: from the last turn of the tide to the next.
  const next = tide.nextHigh.time < tide.nextLow.time ? tide.nextHigh : tide.nextLow
  const low = next.type === 'H' ? tide.prev.height : next.height
  const high = next.type === 'H' ? next.height : tide.prev.height
  const f = high === low ? 0.5 : Math.min(1, Math.max(0, (height - low) / (high - low)))
  const angle = Math.PI * f
  const mx = CX - R * Math.cos(angle)
  const my = CY - R * Math.sin(angle)

  const stand = live?.trend === 'steady'
  const state = stand ? 'Stand' : rising ? 'Flood tide' : 'Ebb tide' // "tide" keeps it apart from coastal flooding
  const glyph = stand ? '◆' : rising ? '▲' : '▼'
  const diff = live?.diff != null && Math.abs(live.diff) >= 0.05 ? `${live.diff > 0 ? '+' : '−'}${Math.abs(live.diff).toFixed(1)} ft` : null
  const time = (e) => formatStationTime(e.local, { withDay: false })
  const day = (e) => formatStationTime(e.local).split(/[ ,]/)[0]

  const label =
    `${live ? 'Observed' : 'Predicted'} height of tide ${ft(height)}, ${stand ? 'at stand' : rising ? 'flooding' : 'ebbing'}` +
    `${diff ? `, ${diff.replace('−', 'minus ').replace('+', 'plus ')} against prediction` : ''}. ` +
    `Next high water ${formatStationTime(tide.nextHigh.local)}, ${ft(tide.nextHigh.height)}. Next low water ${formatStationTime(tide.nextLow.local)}, ${ft(tide.nextLow.height)}.`

  const End = ({ e, x, anchor }) => {
    const soon = e === next
    return (
      <g className={`dial-end ${e.type === 'H' ? 'high' : 'low'}${soon ? ' soon' : ''}`} textAnchor={anchor}>
        <text x={x} y="176" className="dial-end-name">{e.type === 'H' ? '▲ HW' : '▼ LW'} <tspan className="dial-end-day">{day(e)}</tspan></text>
        <text x={x} y="197" className="dial-end-time">{time(e)}</text>
        <text x={x} y="213" className="dial-end-sub">{ft(e.height)} · {formatCountdown(e.time - now).replace('in ', '')}</text>
      </g>
    )
  }

  return (
    <section className="dial-wrap">
      <svg className="dial" viewBox="0 0 360 220" role="img" aria-label={label}>
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} className="dial-track" />
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} className={`dial-fill ${rising ? 'flood' : 'ebb'}`} pathLength="1" strokeDasharray={`${f} 1`} />
        {/* quarter marks */}
        {[0.25, 0.5, 0.75].map((q) => {
          const a = Math.PI * q
          return <line key={q} x1={CX - (R - 9) * Math.cos(a)} y1={CY - (R - 9) * Math.sin(a)} x2={CX - (R + 9) * Math.cos(a)} y2={CY - (R + 9) * Math.sin(a)} className="dial-tick" />
        })}
        <circle cx={mx} cy={my} r="11" className={`dial-marker ${live ? 'observed' : 'predicted'}`} />
        <text x={CX} y="112" textAnchor="middle" className="dial-height">{ft(height)}</text>
        <text x={CX} y="137" textAnchor="middle" className={`dial-state ${stand ? 'stand' : rising ? 'flood' : 'ebb'}`}>{glyph} {state}</text>
        <text x={CX} y="155" textAnchor="middle" className="dial-source">
          {live ? <>● observed {formatAtStation(live.time, tide.offsetMs)}{diff ? ` · ${diff}` : ''}</> : '○ predicted'}
        </text>
        <End e={tide.nextLow} x={18} anchor="start" />
        <End e={tide.nextHigh} x={342} anchor="end" />
      </svg>
      {note && <p className="dial-note">{note}</p>}
    </section>
  )
}
