// "At a glance": a plain-English summary and answers to common questions, written by
// rules from the data the app already has. No AI, no server, works offline.
import { formatStationTime, offsetAt, stationDate, ft } from './tides.js'
import { diffText } from './surge.js'
import { floodStage } from './history.js'
import { isNight } from './astro.js'

const DAY = 86400e3
const MPH_PER_KNOT = 1.15078
const time = (e, withDay = false) => formatStationTime(e.local, { withDay })
const upcoming = (events, now, days) => events.filter((e) => e.time > now && e.time - now < days * DAY)

/**
 * Two to four sentences on what matters right now.
 * input: { now, events, tide (tideNow), live, forecastNow, alerts, flood, surgeFeet, weather }
 */
export function localBriefing({ now, events, tide, live, forecastNow, alerts = [], flood, surgeFeet, weather }) {
  const out = []

  // 1. Where the water is.
  if (live) {
    const trend = live.trend === 'rising' ? 'rising' : live.trend === 'falling' ? 'falling' : live.trend === 'steady' ? 'holding steady' : tide.rising ? 'rising' : 'falling'
    const off = live.diff != null && Math.abs(live.diff) >= 0.2 ? `, ${diffText(live.diff).replace('predicted', 'the forecast')}` : ''
    out.push(`The water is at ${ft(live.height)} and ${trend}${off}.`)
  } else {
    out.push(`The water is around ${ft(forecastNow ?? tide.height)} and ${tide.rising ? 'coming in' : 'going out'} (forecast; no live reading).`)
  }

  // 2. Next high and low, in the order they come.
  const [first, second] = [tide.nextHigh, tide.nextLow].sort((a, b) => a.time - b.time)
  const name = (e) => (e.type === 'H' ? 'High' : 'Low')
  out.push(`${name(first)} tide is at ${time(first)} (${ft(first.height)}), then ${name(second).toLowerCase()} at ${time(second)} (${ft(second.height)}).`)

  // 3. Flooding, if the water is at flood level or the next day's highs could reach it.
  if (flood) {
    const surge = live?.diff > 0 ? live.diff : 0
    const stageNow = live ? floodStage(live.height, flood) : null
    const risky = upcoming(events, now, 1).find((e) => e.type === 'H' && floodStage(e.height + surge, flood))
    if (stageNow) out.push(`That is ${stageNow} flood level (flooding starts at ${ft(flood.minor)}).`)
    else if (risky) {
      out.push(`The ${time(risky)} high could reach ${floodStage(risky.height + surge, flood)} flood level${surge && !floodStage(risky.height, flood) ? ' if the water stays this far above the forecast' : ''}; flooding starts at ${ft(flood.minor)}.`)
    }
  }

  // 4. Water well off the forecast (wind or storm), unless flooding already said it.
  if (live?.diff != null && surgeFeet != null && Math.abs(live.diff) >= surgeFeet && out.length < 4) {
    out.push(`Wind or a storm is pushing the water ${live.diff > 0 ? 'up' : 'out'}, so expect tides to run ${live.diff > 0 ? 'higher' : 'lower'} than the times and heights shown.`)
  }

  // 5. An unusually big swing under way or starting within 12 hours.
  const swing = alerts.find((a) => a.inProgress || a.from.time - now < 12 * 3600e3)
  if (swing && out.length < 4) {
    out.push(swing.inProgress
      ? `A bigger swing than usual is under way: the water ${swing.rising ? 'rises' : 'drops'} ${ft(swing.size)} by ${time(swing.to)}.`
      : `A bigger swing than usual starts at ${time(swing.from)}: the water ${swing.rising ? 'rises' : 'drops'} ${ft(swing.size)} by ${time(swing.to)}.`)
  }

  // 6. Wind worth mentioning.
  const w = weather?.wind
  if (w && w.knots * MPH_PER_KNOT >= 15 && (!w.time || now - w.time < 3 * 3600e3) && out.length < 4) {
    out.push(`Wind is ${w.dir ?? ''} ${Math.round(w.knots * MPH_PER_KNOT)} mph${w.gust != null ? `, gusting ${Math.round(w.gust * MPH_PER_KNOT)}` : ''}.`.replace('  ', ' '))
  }
  return out
}

const daylight = (e, station, events) => station?.lat != null && !isNight(e.time, station.lat, station.lng, offsetAt(events, e.time))
const dayNote = (e, station, events) => (station?.lat == null ? '' : daylight(e, station, events) ? ', in daylight' : ', after dark')

/** One-tap questions answered from the predictions. ctx: { now, events, flood, live, station } */
export const PRESETS = [
  {
    id: 'weekend-low',
    label: 'Lowest tide this weekend?',
    answer({ now, events, station }) {
      const off = (t) => offsetAt(events, t)
      const isWeekend = (e) => [0, 6].includes(new Date(Date.parse(`${stationDate(e.time, off(e.time))}T12:00:00Z`)).getUTCDay())
      const lows = upcoming(events, now, 8).filter((e) => e.type === 'L' && isWeekend(e))
      if (!lows.length) return 'No low tides fall on the coming weekend in the forecast.'
      // The first weekend only (drop next Saturday if today is Sunday).
      const firstDay = lows[0].time.getTime()
      const weekend = lows.filter((e) => e.time - firstDay < 2 * DAY)
      const lowest = weekend.reduce((a, b) => (b.height < a.height ? b : a))
      const inSun = weekend.filter((e) => daylight(e, station, events))
      const bestDay = inSun.length ? inSun.reduce((a, b) => (b.height < a.height ? b : a)) : null
      let text = `The lowest tide this weekend is ${time(lowest, true)} at ${ft(lowest.height)}${dayNote(lowest, station, events)}.`
      if (bestDay && bestDay !== lowest) text += ` The lowest in daylight is ${time(bestDay, true)} at ${ft(bestDay.height)}.`
      return text
    },
  },
  {
    id: 'flood-week',
    label: 'Any flooding this week?',
    answer({ now, events, flood, live }) {
      const highs = upcoming(events, now, 7).filter((e) => e.type === 'H')
      if (!highs.length) return 'No forecast available for the coming week.'
      const top = highs.reduce((a, b) => (b.height > a.height ? b : a))
      if (!flood) return `NOAA doesn't publish flood levels for this station. The highest forecast tide this week is ${ft(top.height)} on ${time(top, true)}.`
      const hits = highs.filter((e) => floodStage(e.height, flood))
      if (hits.length) {
        const list = hits.slice(0, 3).map((e) => `${time(e, true)} (${ft(e.height)}, ${floodStage(e.height, flood)})`).join('; ')
        return `Yes: ${hits.length} high tide${hits.length > 1 ? 's are' : ' is'} forecast to reach flood level this week: ${list}${hits.length > 3 ? '; and more' : ''}. Flooding starts at ${ft(flood.minor)}.`
      }
      const gap = flood.minor - top.height
      const surge = live?.diff > 0.2 ? ` Right now the water is running ${live.diff.toFixed(1)} ft above the forecast, which narrows that gap.` : ''
      return `None is forecast. The highest tide this week is ${ft(top.height)} on ${time(top, true)}, ${gap.toFixed(1)} ft below where minor flooding starts (${ft(flood.minor)}). Strong onshore wind or a storm can still push water higher.${surge}`
    },
  },
  {
    id: 'highest-week',
    label: 'Highest and lowest this week?',
    answer({ now, events, station }) {
      const week = upcoming(events, now, 7)
      const highs = week.filter((e) => e.type === 'H')
      const lows = week.filter((e) => e.type === 'L')
      if (!highs.length || !lows.length) return 'No forecast available for the coming week.'
      const top = highs.reduce((a, b) => (b.height > a.height ? b : a))
      const bottom = lows.reduce((a, b) => (b.height < a.height ? b : a))
      return `Highest: ${ft(top.height)} on ${time(top, true)}${dayNote(top, station, events)}. Lowest: ${ft(bottom.height)} on ${time(bottom, true)}${dayNote(bottom, station, events)}.`
    },
  },
  {
    id: 'daylight-low',
    label: 'Next low tide in daylight?',
    answer({ now, events, station }) {
      if (station?.lat == null) return "This station has no location on record, so daylight can't be worked out."
      const low = upcoming(events, now, 7).find((e) => e.type === 'L' && daylight(e, station, events))
      return low ? `${time(low, true)}, at ${ft(low.height)}.` : 'No low tide falls in daylight in the next 7 days.'
    },
  },
]
