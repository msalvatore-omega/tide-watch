// Live (measured) water level: fetching, refreshing and comparing with predictions.
import { useEffect, useRef, useState } from 'react'
import { fetchLive, fetchLiveStations, distanceMiles } from './noaa.js'

const REFRESH_MS = 6 * 60e3 // NOAA gauges report every 6 minutes
export const SURGE_ALERT_FT = 1.0 // flag water this far above/below the prediction

/**
 * Keeps live gauge data fresh while `enabled`.
 * status: 'idle' | 'loading' | 'ok' | 'unavailable' (station has no gauge) | 'error'
 */
export function useLiveWater(stationId, enabled) {
  const [state, setState] = useState({ status: 'idle' })
  const [tick, setTick] = useState(0)
  const lastFetch = useRef(0)

  // Refetch every 6 minutes, and right away when returning to a stale tab.
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > REFRESH_MS) setTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    lastFetch.current = Date.now()
    // Keep showing the old reading while refreshing the same station.
    setState((s) => (s.stationId === stationId && s.status === 'ok' ? s : { status: 'loading', stationId }))
    fetchLive(stationId)
      .then((data) => {
        if (cancelled) return
        setState(data.observed.length
          ? { status: 'ok', stationId, data, fetchedAt: new Date() }
          : { status: 'unavailable', stationId })
      })
      .catch((e) => !cancelled && setState({ status: e.noData ? 'unavailable' : 'error', stationId, message: e.message }))
    return () => { cancelled = true }
  }, [stationId, enabled, tick])

  return state
}

/** Nearest station with a live gauge, for stations that don't have one. */
export function useNearestLiveGauge(station, wanted) {
  const [nearest, setNearest] = useState(null)
  useEffect(() => {
    if (!wanted || station?.lat == null) return
    let cancelled = false
    fetchLiveStations()
      .then((all) => {
        if (cancelled) return
        const best = all
          .filter((s) => s.id !== station.id)
          .map((s) => ({ ...s, miles: distanceMiles(station.lat, station.lng, s.lat, s.lng) }))
          .sort((a, b) => a.miles - b.miles)[0]
        setNearest(best ?? null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [station, wanted])
  return wanted ? nearest : null
}

// Linear interpolation over a time series of { time, height }.
function valueAt(series, t) {
  const i = series.findIndex((p) => p.time >= t)
  if (i === -1) return null
  if (i === 0) return series[0].time.getTime() === t.getTime() ? series[0].height : null
  const a = series[i - 1]
  const b = series[i]
  return a.height + ((b.height - a.height) * (t - a.time)) / (b.time - a.time)
}

/** Latest reading, how it compares with the prediction, and which way it's moving. */
export function liveNow({ observed, predicted }, now) {
  const latest = observed.at(-1)
  if (!latest) return null
  const predictedThen = valueAt(predicted, latest.time)
  // Compare with the reading ~30 minutes earlier to smooth out wave chop.
  const earlier = observed.findLast((o) => latest.time - o.time >= 30 * 60e3)
  const delta = earlier ? latest.height - earlier.height : null
  const trend = delta == null ? null : delta > 0.03 ? 'rising' : delta < -0.03 ? 'falling' : 'steady'
  return {
    height: latest.height,
    time: latest.time,
    ageMs: now - latest.time,
    predicted: predictedThen,
    diff: predictedThen == null ? null : latest.height - predictedThen,
    trend,
  }
}

export function diffText(diff) {
  if (diff == null) return ''
  if (Math.abs(diff) < 0.05) return 'right on prediction'
  return `${Math.abs(diff).toFixed(1)} ft ${diff > 0 ? 'above' : 'below'} predicted`
}

export function liveMood(live, fallbackMood) {
  if (live.diff != null && live.diff >= SURGE_ALERT_FT) return 'Water is running well above the forecast: wind or storm surge. 🌬️'
  if (live.diff != null && live.diff <= -SURGE_ALERT_FT) return 'Water is well below the forecast: wind is pushing it out. 🌬️'
  return fallbackMood
}
