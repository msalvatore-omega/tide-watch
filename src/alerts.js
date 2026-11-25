// "Big swing" alerts: a swing is the change in height from one high/low to the next.
// A swing is flagged when it is unusually large for *this* station (auto mode:
// top 10% of the month's swings) or bigger than a fixed number of feet (custom).

export function swingsFrom(events) {
  const swings = []
  for (let i = 0; i < events.length - 1; i++) {
    const from = events[i]
    const to = events[i + 1]
    swings.push({ from, to, size: Math.abs(to.height - from.height), rising: to.type === 'H' })
  }
  return swings
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  return sorted[Math.round(p * (sorted.length - 1))]
}

export function swingStats(swings) {
  const sizes = swings.map((s) => s.size).sort((a, b) => a - b)
  return { typical: percentile(sizes, 0.5), big: percentile(sizes, 0.9), max: sizes.at(-1) ?? 0 }
}

/**
 * Upcoming big swings within `days`, plus any happening right now.
 * settings: { mode: 'auto' } or { mode: 'custom', feet: number }
 */
export function findAlerts(events, now, settings, days = 7) {
  const swings = swingsFrom(events)
  const stats = swingStats(swings)
  const threshold = settings.mode === 'custom' ? settings.feet : stats.big
  const horizon = now.getTime() + days * 24 * 3600e3
  const alerts = swings
    .filter((s) => s.to.time > now && s.from.time.getTime() < horizon && s.size >= threshold)
    .map((s) => ({ ...s, ratio: stats.typical ? s.size / stats.typical : 1, inProgress: s.from.time <= now }))
  return { alerts, stats, threshold }
}

/** Calendar file with a reminder before each big swing — works on any phone, no server needed. */
export function alertsToICS(alerts, stationName, reminderMinutes = 120) {
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const esc = (s) => s.replace(/([,;\\])/g, '\\$1')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tidely//Swing Alerts//EN', 'CALSCALE:GREGORIAN']
  for (const a of alerts) {
    const what = a.rising ? 'rises' : 'drops'
    const title = `🌊 Big tide swing: water ${what} ${a.size.toFixed(1)} ft`
    lines.push(
      'BEGIN:VEVENT',
      `UID:${stamp(a.from.time)}-${esc(stationName).replace(/\W/g, '')}@tidely`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(a.from.time)}`,
      `DTEND:${stamp(a.to.time)}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(`${stationName}: ${a.from.height.toFixed(1)} ft → ${a.to.height.toFixed(1)} ft. About ${a.ratio.toFixed(1)}× a typical swing here.`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(title)}`,
      `TRIGGER:-PT${reminderMinutes}M`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
