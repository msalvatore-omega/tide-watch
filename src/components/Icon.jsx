// Plain line icons, drawn in the text colour. Decorative by default (hidden from screen
// readers); pass `label` when the icon carries meaning on its own.
const PATHS = {
  wave: 'M2 9c2.5-3 4.5-3 7 0s4.5 3 7 0 4-3 6-1M2 16c2.5-3 4.5-3 7 0s4.5 3 7 0 4-3 6-1',
  wind: 'M3 9h10a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7',
  warning: 'M12 4 2.5 20h19L12 4ZM12 10v5M12 17.6v.4',
  flag: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  offline: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.6M19 13a10 10 0 0 0-5-2.8M12 20v.2',
  cloud: 'M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9.5a4.2 4.2 0 0 1 0 8.5H7Z',
  fog: 'M7 13a4 4 0 0 1-.5-7.9A5.5 5.5 0 0 1 17 5.5 4 4 0 0 1 18 13M4 17h16M6 21h12',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  sunrise: 'M4 18h16M7 18a5 5 0 0 1 10 0M12 3v6M9 6l3-3 3 3M3 21h18',
  sunset: 'M4 18h16M7 18a5 5 0 0 1 10 0M12 9V3M9 6l3 3 3-3M3 21h18',
  rules: 'M4 6h3M11 6h9M4 12h9M17 12h3M4 18h5M13 18h7M9 4v4M15 10v4M11 16v4',
  chat: 'M4 5h16v11H9l-5 4V5Z',
  range: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
  anchor: 'M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 7v14M5 13a7 7 0 0 0 14 0M8 11h8',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  ruler: 'M3 16 16 3l5 5L8 21l-5-5ZM7 12l2 2M10 9l2 2M13 6l2 2',
  tour: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z',
  calendar: 'M4 6h16v14H4V6ZM4 10h16M8 3v4M16 3v4',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  bell: 'M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2ZM10 21h4',
  bellOff: 'M6 17V11a6 6 0 0 1 9-5.2M18 11v6l2 2H8M10 21h4M3 3l18 18',
  check: 'M4 12.5 9.5 18 20 6',
  book: 'M4 5c3-1.5 5.500-1.500 8 0v15c-2.500-1.500-5-1.500-8 0V5ZM20 5c-3-1.500-5.500-1.500-8 0v15c2.500-1.500 5-1.500 8 0V5Z',
  note: 'M6 3h9l4 4v14H6V3ZM15 3v4h4M9 12h7M9 16h7',
  history: 'M4 12a8 8 0 1 0 2.5-5.800M4 4v4h4M12 8v4l3 2',
  up: 'M12 20V5M6 11l6-6 6 6',
  down: 'M12 4v15M6 13l6 6 6-6',
  trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  trendDown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  record: 'M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6',
  pin: 'M12 21s7-6.200 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11ZM12 8a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5Z',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6ZM9 4v14M15 6v14',
  print: 'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7v-7Z',
  chart: 'M3 20h18M3 15c3 0 3-8 6-8s3 10 6 10 3-6 6-6',
  table: 'M4 6h16M4 12h16M4 18h16',
  boat: 'M3 15h18l-3 5H6l-3-5ZM12 15V3l6 9h-6M12 6l-4 6h4',
  fish: 'M3 12c3-5 9-6 13-2l4-3v10l-4-3c-4 4-10 3-13-2ZM8 11v.2',
  walk: 'M13 5a1.500 1.500 0 1 0 0-3 1.500 1.500 0 0 0 0 3ZM9 22l2-7-3-3 1-5 4 1 2 4 3 1M13 15l3 3v4M9 7 6 9v3',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1 1-1 1.700M12 17v.2',
  calm: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 14c1 1.500 2.500 2 4 2s3-.500 4-2M9 9.500v.2M15 9.500v.2',
}

export default function Icon({ name, size = '1.15em', label, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <path d={PATHS[name] ?? PATHS.help} />
    </svg>
  )
}
