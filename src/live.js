// Live (measured) water level: fetching, refreshing and comparing with predictions.
import { useEffect, useRef, useState } from 'react'
import { fetchLive, fetchLiveStations, distanceMiles } from './noaa.js'

export { DEFAULT_SURGE_FT, SURGE_CHOICES, isSurge, liveNow, diffText, liveMood } from './surge.js'

const REFRESH_MS = 6 * 60e3 // NOAA gauges report every 6 minutes
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
