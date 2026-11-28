// Live data hooks: 6-minute predictions + gauge readings, and gauge weather.
import { useEffect, useRef, useState } from 'react'
import { fetchSixMinute, fetchConditions, fetchLiveStations, fetchLevelNow, fetchNextTides, distanceMiles } from './noaa.js'
import { heightAt } from './tides.js'

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

/**
 * The tide at a station right now, as briefly as possible: the gauge's reading where
 * there is one, else the predicted height worked out between high and low water.
 * { height, trend: 'rising' | 'falling' | 'steady' | null, observed } or null.
 */
export async function stationGlance(stationId, now = new Date()) {
  const level = await fetchLevelNow(stationId).catch(() => null)
  if (level) return { height: level.height, trend: level.trend, observed: true }
  const tides = await fetchNextTides(stationId)
  const height = heightAt(tides, now)
  const next = tides.find((e) => e.time > now)
  return height == null ? null : { height, trend: next.type === 'H' ? 'rising' : 'falling', observed: false }
}

/** A glance for each favorite station (id → glance), refreshed every 6 minutes. */
export function useFavoriteGlances(favorites) {
  const [glances, setGlances] = useState({})
  const ids = favorites.map((f) => f.id).join(',')
  useEffect(() => {
    if (!ids) return
    let cancelled = false
    const read = () => {
      for (const id of ids.split(',')) {
        stationGlance(id).then((g) => !cancelled && setGlances((old) => ({ ...old, [id]: g })), () => {})
      }
    }
    read()
    const timer = setInterval(read, 6 * 60e3)
    return () => { cancelled = true; clearInterval(timer) }
  }, [ids])
  return glances
}

/**
 * Whether NOAA lists this station as having a live tide gauge: true, false, or null while
 * unknown. Asked only when `wanted` (the gauge returned nothing), to tell "no gauge here"
 * from "the gauge is not reporting just now".
 */
export function useGaugeListed(station, wanted) {
  const [state, setState] = useState(null)
  const id = station?.id
  useEffect(() => {
    if (!wanted || !id) return
    let cancelled = false
    fetchLiveStations()
      .then((all) => !cancelled && setState({ id, listed: all.some((s) => s.id === id) }))
      .catch(() => {})
    return () => { cancelled = true }
  }, [id, wanted])
  return wanted && state?.id === id ? state.listed : null
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
