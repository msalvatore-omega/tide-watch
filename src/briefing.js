// "At a glance": a plain-English summary and answers to common questions, written by
// rules from the data the app already has. No AI, no server, works offline.
import { formatStationTime, offsetAt, stationDate, beaufort, ft } from './tides.js'
import { diffText } from './surge.js'
import { floodStage } from './history.js'
import { isNight } from './astro.js'

const DAY = 86400e3
const time = (e, withDay = false) => formatStationTime(e.local, { withDay })
const upcoming = (events, now, days) => events.filter((e) => e.time > now && e.time - now < days * DAY)

/**
 * Two to four sentences on what matters right now, in seaman's terms.
 * input: { now, events, tide (tideNow), live, forecastNow, alerts, flood, surgeFeet, weather }
 */
export function localBriefing({ now, events, tide, live, forecastNow, alerts = [], flood, surgeFeet, weather }) {
  const out = []
  const water = (e) => (e.type === 'H' ? 'high water' : 'low water')

  // 1. Height of tide and whether it is flooding or ebbing.
  if (live) {
    const trend = live.trend === 'rising' ? 'flooding' : live.trend === 'falling' ? 'ebbing' : live.trend === 'steady' ? 'at stand' : tide.rising ? 'flooding' : 'ebbing'
    const off = live.diff != null && Math.abs(live.diff) >= 0.2 ? `, ${diffText(live.diff).replace('predicted', 'prediction')}` : ''
    out.push(`Height of tide is ${ft(live.height)} and ${trend}${off}.`)
  } else {
    out.push(`Predicted height of tide is about ${ft(forecastNow ?? tide.height)}, ${tide.rising ? 'flooding' : 'ebbing'} (no gauge observation).`)
  }

  // 2. Next high and low water, in the order they come.
  const [first, second] = [tide.nextHigh, tide.nextLow].sort((a, b) => a.time - b.time)
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  out.push(`${cap(water(first))} at ${time(first)} (${ft(first.height)}), then ${water(second)} at ${time(second)} (${ft(second.height)}).`)

  // 3. Coastal flooding: at flood stage now, or a high water in the next day could reach it.
  if (flood) {
    const surge = live?.diff > 0 ? live.diff : 0
    const stageNow = live ? floodStage(live.height, flood) : null
    const risky = upcoming(events, now, 1).find((e) => e.type === 'H' && floodStage(e.height + surge, flood))
    if (stageNow) out.push(`That is ${stageNow} flood stage (minor flood stage is ${ft(flood.minor)}).`)
    else if (risky) {
      out.push(`The ${time(risky)} high water could reach ${floodStage(risky.height + surge, flood)} flood stage${surge && !floodStage(risky.height, flood) ? ' if the water stays this far above prediction' : ''}; minor flood stage is ${ft(flood.minor)}.`)
    }
  }

  // 4. Water well off prediction (wind set-up, surge or blow-out), unless flooding already said it.
  if (live?.diff != null && surgeFeet != null && Math.abs(live.diff) >= surgeFeet && out.length < 4) {
    out.push(live.diff > 0
      ? 'Wind set-up or storm surge is raising the water, so expect heights above those predicted.'
      : 'Offshore wind is blowing the water out, so expect less depth than predicted.')
  }

  // 5. An unusually large range under way or starting within 12 hours.
  const big = alerts.find((a) => a.inProgress || a.from.time - now < 12 * 3600e3)
  if (big && out.length < 4) {
    const move = `a ${big.rising ? 'rise' : 'fall'} of ${ft(big.size)} to ${water(big.to)} at ${time(big.to)}`
    out.push(big.inProgress ? `A larger range than usual is under way: ${move}.` : `A larger range than usual begins at ${time(big.from)}: ${move}.`)
  }

  // 6. Wind worth mentioning (Force 4 and up).
  const w = weather?.wind
  if (w && w.knots >= 13 && (!w.time || now - w.time < 3 * 3600e3) && out.length < 4) {
    out.push(`Wind ${w.dir ?? ''} ${Math.round(w.knots)} kt (Force ${beaufort(w.knots).force})${w.gust != null ? `, gusting ${Math.round(w.gust)}` : ''}.`.replace('  ', ' '))
  }
  return out
}

const daylight = (e, station, events) => station?.lat != null && !isNight(e.time, station.lat, station.lng, offsetAt(events, e.time))
const dayNote = (e, station, events) => (station?.lat == null ? '' : daylight(e, station, events) ? ', in daylight' : ', after dark')

/** One-tap questions answered from the predictions. ctx: { now, events, flood, live, station } */
export const PRESETS = [
  {
    id: 'weekend-low',
    label: 'Lowest water this weekend?',
    answer({ now, events, station }) {
      const off = (t) => offsetAt(events, t)
      const isWeekend = (e) => [0, 6].includes(new Date(Date.parse(`${stationDate(e.time, off(e.time))}T12:00:00Z`)).getUTCDay())
      const lows = upcoming(events, now, 8).filter((e) => e.type === 'L' && isWeekend(e))
      if (!lows.length) return 'No low waters fall on the coming weekend in the predictions.'
      // The first weekend only (drop next Saturday if today is Sunday).
      const firstDay = lows[0].time.getTime()
      const weekend = lows.filter((e) => e.time - firstDay < 2 * DAY)
      const lowest = weekend.reduce((a, b) => (b.height < a.height ? b : a))
      const inSun = weekend.filter((e) => daylight(e, station, events))
      const bestDay = inSun.length ? inSun.reduce((a, b) => (b.height < a.height ? b : a)) : null
      let text = `The lowest low water this weekend is ${time(lowest, true)} at ${ft(lowest.height)}${dayNote(lowest, station, events)}.`
      if (bestDay && bestDay !== lowest) text += ` The lowest in daylight is ${time(bestDay, true)} at ${ft(bestDay.height)}.`
      return text
    },
  },
  {
    id: 'flood-week',
    label: 'Any coastal flooding this week?',
    answer({ now, events, flood, live }) {
      const highs = upcoming(events, now, 7).filter((e) => e.type === 'H')
      if (!highs.length) return 'No predictions available for the coming week.'
      const top = highs.reduce((a, b) => (b.height > a.height ? b : a))
      if (!flood) return `NOAA publishes no flood stages for this station. The highest predicted high water this week is ${ft(top.height)} on ${time(top, true)}.`
      const hits = highs.filter((e) => floodStage(e.height, flood))
      if (hits.length) {
        const list = hits.slice(0, 3).map((e) => `${time(e, true)} (${ft(e.height)}, ${floodStage(e.height, flood)})`).join('; ')
        return `Yes: ${hits.length} high water${hits.length > 1 ? 's are' : ' is'} predicted to reach flood stage this week: ${list}${hits.length > 3 ? '; and more' : ''}. Minor flood stage is ${ft(flood.minor)}.`
      }
      const gap = flood.minor - top.height
      const surge = live?.diff > 0.2 ? ` The water is now running ${live.diff.toFixed(1)} ft above prediction, which narrows that margin.` : ''
      return `None predicted. The highest high water this week is ${ft(top.height)} on ${time(top, true)}, ${gap.toFixed(1)} ft below minor flood stage (${ft(flood.minor)}). A strong onshore wind or storm surge can still raise it.${surge}`
    },
  },
  {
    id: 'highest-week',
    label: 'Highest and lowest water this week?',
    answer({ now, events, station }) {
      const week = upcoming(events, now, 7)
      const highs = week.filter((e) => e.type === 'H')
      const lows = week.filter((e) => e.type === 'L')
      if (!highs.length || !lows.length) return 'No predictions available for the coming week.'
      const top = highs.reduce((a, b) => (b.height > a.height ? b : a))
      const bottom = lows.reduce((a, b) => (b.height < a.height ? b : a))
      return `Highest high water: ${ft(top.height)} on ${time(top, true)}${dayNote(top, station, events)}. Lowest low water: ${ft(bottom.height)} on ${time(bottom, true)}${dayNote(bottom, station, events)}.`
    },
  },
  {
    id: 'daylight-low',
    label: 'Next daylight low water?',
    answer({ now, events, station }) {
      if (station?.lat == null) return "This station has no location on record, so daylight can't be worked out."
      const low = upcoming(events, now, 7).find((e) => e.type === 'L' && daylight(e, station, events))
      return low ? `Low water ${time(low, true)}, ${ft(low.height)}.` : 'No low water falls in daylight in the next 7 days.'
    },
  },
]
