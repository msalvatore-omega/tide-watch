// The picture: a shore with a numbered tide staff. The water sits at the present
// height of tide; dashed lines show where the next high and low water will reach; the
// conditions are laid over the top of it by the page (see SceneWeather in App).
// Drawn in one SVG viewBox so it scales cleanly from phones to desktops.
import { ft, hNum, isMetric, tempText, beaufort } from '../tides.js'

const W = 800
const H = 480
const HIGH_Y = 262 // water surface at the top of the scale
const LOW_Y = 412 // water surface at the bottom of the scale
const beachY = (x) => 480 - 0.42 * x // sloped shoreline
// Visible window (2:1): trims empty sky and deep water.
const VIEW_TOP = 60
const VIEW_H = 400
const STAFF = 690 // x of the tide staff

// Things on the sand: the water covers them as the tide makes.
const SAND_CRITTERS = [
  { x: 250, emoji: '🐚', size: 24 },
  { x: 400, emoji: '🦀', size: 30, className: 'scuttle' },
]

const CHAR_W = 12.6 // rough width of one character at font size 22

/** A rounded label. `anchor` says which end sits at x. */
function Pill({ x, y, text, tone = 'plain', anchor = 'start', size = 22 }) {
  const w = text.length * CHAR_W * (size / 22) + 22
  const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x
  return (
    <g className={`scene-label ${tone}`}>
      <rect x={left} y={y - size * 0.82} width={w} height={size * 1.5} rx={size * 0.75} />
      <text x={left + w / 2} y={y + size * 0.28} fontSize={size} textAnchor="middle">{text}</text>
    </g>
  )
}

export default function TideScene({ height, min, max, rising, stand, observed, night, nextHigh, nextLow, flood, weather }) {
  const y = (h) => LOW_Y - ((h - min) / (max - min || 1)) * (LOW_Y - HIGH_Y)
  const waterY = Math.max(VIEW_TOP + 60, Math.min(LOW_Y + 20, y(height)))

  // Staff graduations: whole feet (or quarter / half metres), sparser on big ranges.
  const span = max - min
  const stepFt = isMetric() ? (span > 10 ? 1 / 0.3048 : 0.5 / 0.3048) : span > 9 ? 2 : 1
  const ticks = []
  for (let v = Math.ceil((min - span * 0.4) / stepFt) * stepFt; v <= max + span * 0.9; v += stepFt) ticks.push(v)
  const staffTop = Math.max(VIEW_TOP + 92, Math.min(...ticks.map(y), HIGH_Y) - 14)

  const floodY = flood ? y(flood) : null
  const showFlood = floodY != null && floodY > VIEW_TOP + 110 && floodY < LOW_Y
  const hwY = nextHigh ? y(nextHigh.height) : null
  const lwY = nextLow ? y(nextLow.height) : null
  const state = stand ? 'at stand' : rising ? 'flooding' : 'ebbing'

  const wind = weather?.wind
  const baro = weather?.pressure

  const label =
    `Picture of the shore. Height of tide ${ft(height)} (${observed ? 'observed' : 'predicted'}), ${state}.` +
    (nextHigh ? ` Next high water ${nextHigh.label}, ${ft(nextHigh.height)}.` : '') +
    (nextLow ? ` Next low water ${nextLow.label}, ${ft(nextLow.height)}.` : '') +
    (flood ? ` Minor flood stage ${ft(flood)}.` : '') +
    (wind ? ` Wind ${wind.dir ?? ''} ${Math.round(wind.knots)} knots, force ${beaufort(wind.knots).force}.` : '') +
    (weather?.airTemp ? ` Air ${tempText(weather.airTemp.f)}.` : '') +
    (weather?.waterTemp ? ` Sea ${tempText(weather.waterTemp.f)}.` : '') +
    (baro ? ` Barometer ${Math.round(baro.mb)} millibars.` : '')

  return (
    <svg className="scene" viewBox={`0 ${VIEW_TOP} ${W} ${VIEW_H}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? '#0b1d3a' : '#5db8ee'} />
          <stop offset="1" stopColor={night ? '#2a4a7a' : '#d6f0ff'} />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? '#2b6aa8' : '#3aa0e6'} stopOpacity="0.88" />
          <stop offset="1" stopColor={night ? '#0f3560' : '#155e9e'} stopOpacity="0.97" />
        </linearGradient>
        <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? '#b9a27a' : '#f6dca6'} />
          <stop offset="1" stopColor={night ? '#8d7756' : '#e2bd7c'} />
        </linearGradient>
      </defs>

      {/* Sky, with the sun or moon */}
      <rect width={W} height={H} fill="url(#sky)" />
      {night ? (
        <g>
          {[[190, 150], [300, 200], [430, 160], [540, 140], [610, 190]].map(([sx, sy], i) => (
            <circle key={i} cx={sx} cy={sy} r={i % 2 ? 1.6 : 2.4} fill="#fff" className="twinkle" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
          <circle cx="70" cy="178" r="26" fill="#f4f1de" />
          <circle cx="81" cy="171" r="23" fill="#0b1d3a" opacity="0.9" />
        </g>
      ) : (
        <g>
          <circle cx="70" cy="178" r="28" fill="#ffd84d" />
          <g className="drift"><Cloud x={470} y={170} scale={0.7} /></g>
        </g>
      )}

      {/* Beach */}
      <path d={`M0 ${beachY(0)} L${W} ${beachY(W)} L${W} ${H} L0 ${H} Z`} fill="url(#sand)" />
      {SAND_CRITTERS.map((c) => (
        <text key={c.x} x={c.x} y={beachY(c.x) + 14} fontSize={c.size} textAnchor="middle" className={c.className}>{c.emoji}</text>
      ))}
      <text x="765" y={beachY(765) - 2} fontSize="34" textAnchor="middle">⛱️</text>

      {/* Water, slid to the present height of tide */}
      <g className="water" style={{ transform: `translateY(${waterY}px)` }}>
        <g className="waves"><path d={wavePath(-80, W + 160, 0, 12)} fill="url(#sea)" /></g>
        <g className="waves slow" opacity="0.5"><path d={wavePath(-80, W + 160, 10, 8)} fill={night ? '#5a92c8' : '#8fd0f7'} /></g>
        <text x="330" y="-6" fontSize="46" className="bob">⛵</text>
        <text x="470" y="52" fontSize="24" className="swim">🐟</text>
      </g>

      {/* Where the water is heading: next high water and next low water */}
      {hwY != null && hwY > VIEW_TOP + 120 && (
        <g>
          <line x1="0" x2={STAFF} y1={hwY} y2={hwY} className="scene-line high" />
          <Pill x={12} y={hwY - 20} text={`▲ HW ${nextHigh.label} · ${ft(nextHigh.height)}`} tone="high" />
        </g>
      )}
      {lwY != null && (
        <g>
          <line x1="0" x2={STAFF} y1={lwY} y2={lwY} className="scene-line low" />
          <Pill x={12} y={lwY + 30} text={`▼ LW ${nextLow.label} · ${ft(nextLow.height)}`} tone="low" />
        </g>
      )}
      {showFlood && (
        <g>
          <line x1="150" x2={STAFF + 20} y1={floodY} y2={floodY} className="scene-line flood" />
          <Pill x={162} y={floodY - 18} text={`Flood stage ${ft(flood)}`} tone="flood" size={20} />
        </g>
      )}

      {/* Tide staff with graduations */}
      <rect x={STAFF} y={staffTop} width="22" height={H - staffTop} rx="3" className="staff" />
      {ticks.filter((v) => y(v) > staffTop + 6 && y(v) < VIEW_TOP + VIEW_H - 6).map((v) => (
        <g key={v}>
          <line x1={STAFF} x2={STAFF + 22} y1={y(v)} y2={y(v)} className="staff-tick" />
          <text x={STAFF + 30} y={y(v) + 7} fontSize="19" className="staff-num">{hNum(v).replace(/\.0+$/, '')}</text>
        </g>
      ))}
      <text x={STAFF + 30} y={staffTop - 4} fontSize="17" className="staff-num">{isMetric() ? 'm' : 'ft'}</text>

      {/* The height now, at the waterline */}
      <g style={{ transform: `translateY(${waterY}px)` }} className="water">
        <polygon points={`${STAFF - 4},0 ${STAFF - 20},-11 ${STAFF - 20},11`} className="now-pointer" />
        <Pill x={STAFF - 20} y={2} anchor="end" text={`${stand ? '◆' : rising ? '▲' : '▼'} NOW ${ft(height)}`} tone="now" size={26} />
      </g>

    </svg>
  )
}

function Cloud({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill="#fff" opacity="0.92">
      <ellipse cx="0" cy="0" rx="46" ry="20" />
      <ellipse cx="34" cy="-10" rx="30" ry="22" />
      <ellipse cx="-30" cy="-6" rx="24" ry="16" />
    </g>
  )
}

// A wavy top edge that fills down past the bottom of the picture.
function wavePath(x0, x1, y, amp) {
  let d = `M${x0} ${y}`
  for (let x = x0; x < x1; x += 80) d += ` q 20 ${-amp} 40 0 t 40 0`
  return `${d} V ${H + 40} H ${x0} Z`
}
