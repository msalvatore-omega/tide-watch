// The "fun picture": a beach whose water line sits where the tide is right now.
// Drawn in one SVG viewBox so it scales cleanly from phones to desktops.

const W = 800
const H = 480
const HIGH_Y = 250 // water surface at the day's highest tide
const LOW_Y = 410 // water surface at the day's lowest tide
const beachY = (x) => 480 - 0.42 * x // sloped shoreline
// Visible window: trims empty sky and deep water so the picture is shorter (2:1).
const VIEW_TOP = 60
const VIEW_H = 400

// Things that live on the sand: the water covers them as the tide comes in.
const SAND_CRITTERS = [
  { x: 190, emoji: '⭐', size: 26 },
  { x: 290, emoji: '🐚', size: 24 },
  { x: 380, emoji: '🦀', size: 30, className: 'scuttle' },
  { x: 470, emoji: '🪸', size: 26 },
]

export default function TideScene({ fraction, rising, night, highLabel, lowLabel }) {
  const waterY = LOW_Y - fraction * (LOW_Y - HIGH_Y)
  const pole = 600

  return (
    <svg
      className="scene"
      viewBox={`0 ${VIEW_TOP} ${W} ${VIEW_H}`}
      role="img"
      aria-label={`Illustration: the tide is ${Math.round(fraction * 100)}% of the way from low water to high water and ${rising ? 'flooding' : 'ebbing'}.`}
    >
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

      {/* Sky */}
      <rect width={W} height={H} fill="url(#sky)" />
      {night ? (
        <g>
          {[[80, 90], [190, 120], [300, 78], [420, 110], [520, 84], [720, 140], [250, 165], [640, 72]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 ? 1.6 : 2.4} fill="#fff" className="twinkle" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
          <circle cx="690" cy="108" r="32" fill="#f4f1de" />
          <circle cx="704" cy="99" r="28" fill="#0b1d3a" opacity="0.9" />
        </g>
      ) : (
        <g>
          <circle cx="690" cy="110" r="36" fill="#ffd84d" />
          <g className="drift">
            <Cloud x={120} y={105} />
            <Cloud x={420} y={88} scale={0.7} />
          </g>
          <text x="300" y="152" fontSize="26" className="glide">🕊️</text>
        </g>
      )}

      {/* Beach */}
      <path d={`M0 ${beachY(0)} L${W} ${beachY(W)} L${W} ${H} L0 ${H} Z`} fill="url(#sand)" />
      {SAND_CRITTERS.map((c) => (
        <text key={c.x} x={c.x} y={beachY(c.x) + 14} fontSize={c.size} textAnchor="middle" className={c.className}>
          {c.emoji}
        </text>
      ))}
      <text x="730" y={beachY(730) - 4} fontSize="40" textAnchor="middle">⛱️</text>

      {/* Water: one group, slid up and down to the current level */}
      <g className="water" style={{ transform: `translateY(${waterY}px)` }}>
        <g className="waves">
          <path d={wavePath(-80, W + 160, 0, 12)} fill="url(#sea)" />
        </g>
        <g className="waves slow" opacity="0.5">
          <path d={wavePath(-80, W + 160, 10, 8)} fill={night ? '#5a92c8' : '#8fd0f7'} />
        </g>
        <text x="130" y="-6" fontSize="48" className="bob">⛵</text>
        <text x="300" y="60" fontSize="26" className="swim">🐟</text>
        <text x="120" y="120" fontSize="22" className="swim slow">🐠</text>
        <text x="420" y="150" fontSize="28">🐙</text>
      </g>

      {/* Tide gauge */}
      <rect x={pole} y="190" width="14" height={H - 150} fill="#8b5a2b" />
      <Mark y={HIGH_Y} x={pole} label={highLabel} />
      <Mark y={LOW_Y} x={pole} label={lowLabel} />
      <g style={{ transform: `translateY(${waterY}px)` }} className="water">
        <polygon points={`${pole - 18},0 ${pole - 2},-10 ${pole - 2},10`} fill="#ff4d4d" stroke="#fff" strokeWidth="2" />
        <text x={pole - 56} y="12" fontSize="32">{rising ? '⬆️' : '⬇️'}</text>
      </g>
    </svg>
  )
}

function Mark({ x, y, label }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x + 34} y2={y} stroke="#1b2a3a" strokeWidth="3" />
      <rect x={x + 36} y={y - 14} width="118" height="28" rx="8" fill="#fff" opacity="0.9" />
      <text x={x + 95} y={y + 6} fontSize="16" fontWeight="700" textAnchor="middle" fill="#1b2a3a">{label}</text>
    </g>
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
