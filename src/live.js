// Live data hooks: 6-minute predictions + gauge readings, and gauge weather.
import { useEffect, useRef, useState } from 'react'
import { fetchSixMinute, fetchConditions, fetchLiveStations, distanceMiles } from './noaa.js'

export { DEFAULT_SURGE_FT, SURGE_CHOICES, isSurge, liveNow, diffText, liveMood } from './surge.js'

const REFRESH_MS = 6 * 60e3 // NOAA gauges report every 6 minutes

/** Re-run `load` for `key` every 6 minutes, and on returning to a stale tab. */
function usePolling(key, load) {
  const [state, setState] = useState({ status: 'idle' })
  const [tick, setTick] = useState(0)
  const lastFetch = useRef(0)

  useEffect(() => {
    if (!key) return
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > REFRESH_MS) setTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [key])

  useEffect(() => {
    if (!key) return
    let cancelled = false
    lastFetch.current = Date.now()
    // Keep showing the previous data while refreshing the same station.
    setState((s) => (s.key === key && s.status === 'ok' ? s : { status: 'loading', key }))
    load(key)
      .then((data) => !cancelled && setState({ status: 'ok', key, data, fetchedAt: new Date() }))
      .catch((e) => !cancelled && setState((s) => (s.key === key && s.status === 'ok' ? s : { status: 'error', key, message: e.message })))
    return () => { cancelled = true }
  }, [key, tick, load])

  return state.key === key ? state : { status: key ? 'loading' : 'idle', key }
}

/** { predicted, observed } for the station, refreshed every 6 minutes. */
export const useSixMinute = (stationId) => usePolling(stationId, fetchSixMinute)

/** Wind / temperatures / pressure at a gauge, refreshed every 6 minutes. */
export const useConditions = (gaugeId) => usePolling(gaugeId, fetchConditions)

/** Nearest station with a live gauge (excluding this one). */
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
        setNearest(best ? { ...best, forId: station.id } : null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [station, wanted])
  return wanted && nearest?.forId === station?.id ? nearest : null
}

/** Whether the device has a network connection (updates live). */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}
