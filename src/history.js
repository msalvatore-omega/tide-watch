// Historical context from NOAA's verified records: "the last time the water was
// this high/low", the last flood, and all-time records.
import { useEffect, useRef, useState } from 'react'
import { fetchMonthlyExtremes, fetchMonthDetail, fetchRecentDaily, fetchDatums, fetchFloodLevels } from './noaa.js'

const DAY = 86400e3

const MAX_GAP_DAYS = 120

/**
 * Most recent time before `before` that the water was at least `level` (dir 'high')
 * or at most `level` (dir 'low'). Searches, newest first:
 *   1. the last ~26 hours of 6-minute readings already loaded (`observed`)
 *   2. daily max/min for the weeks NOAA hasn't verified yet
 *   3. monthly records back to the 1900s, then that month's detail for the exact day
 * Returns { time, height, monthOnly? } or null if never (since records began).
 */
export async function lastBeyond(stationId, level, dir, { before, observed = [], offsetMs = 0 }) {
  const hit = (v) => (dir === 'high' ? v >= level : v <= level)

  for (let i = observed.length - 1; i >= 0; i--) {
    const p = observed[i]
    if (p.time < before && hit(p.height)) return { time: p.time, height: p.height }
  }

  const months = await fetchMonthlyExtremes(stationId)
  const lastVerified = months.at(-1)
  const gapStart = lastVerified ? new Date(Date.UTC(lastVerified.y, lastVerified.m, 1)) : new Date(before.getTime() - 60 * DAY)
  if (gapStart < before) {
    // Where the verified records stop long ago, look back through raw gauge data for
    // MAX_GAP_DAYS only: each month of it is a large download.
    // (from the 1st of a month, so the saved copy is reused from day to day)
    const cap = new Date(before.getTime() - MAX_GAP_DAYS * DAY)
    const from = new Date(Math.max(gapStart.getTime(), Date.UTC(cap.getUTCFullYear(), cap.getUTCMonth(), 1)))
    const days = await fetchRecentDaily(stationId, from, offsetMs)
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i]
      const time = dir === 'high' ? d.maxTime : d.minTime
      const v = dir === 'high' ? d.max : d.min
      if (time < before && hit(v)) return { time, height: v }
    }
  }

  for (let i = months.length - 1; i >= 0; i--) {
    const m = months[i]
    const v = dir === 'high' ? m.hi : m.lo
    if (v == null || !hit(v)) continue
    const detail = await fetchMonthDetail(stationId, m.y, m.m).catch(() => [])
    const match = detail.filter((r) => hit(r.height)).at(-1)
    return match ? { time: match.time, height: match.height } : { time: new Date(Date.UTC(m.y, m.m - 1, 15)), height: v, monthOnly: true }
  }
  return null
}

/** All-time highest and lowest water, with dates. */
export async function records(stationId) {
  const months = await fetchMonthlyExtremes(stationId)
  if (!months.length) return null
  const withHi = months.filter((m) => m.hi != null)
  const withLo = months.filter((m) => m.lo != null)
  if (!withHi.length || !withLo.length) return null
  const top = withHi.reduce((a, b) => (b.hi > a.hi ? b : a))
  const bottom = withLo.reduce((a, b) => (b.lo < a.lo ? b : a))
  const pin = async (m, dir) => {
    const v = dir === 'high' ? m.hi : m.lo
    const detail = await fetchMonthDetail(stationId, m.y, m.m).catch(() => [])
    const best = detail.length ? detail.reduce((a, b) => ((dir === 'high' ? b.height > a.height : b.height < a.height) ? b : a)) : null
    // Monthly extremes come from finer data than hourly values, so keep the monthly figure.
    return { height: v, time: best ? best.time : new Date(Date.UTC(m.y, m.m - 1, 15)), monthOnly: !best }
  }
  const [high, low] = await Promise.all([pin(top, 'high'), pin(bottom, 'low')])
  return { high, low, since: months[0].y }
}

/**
 * Facts for the Now view. Only for stations with a gauge (history needs measurements).
 * Recomputes when the station changes or the level moves by 0.1 ft.
 */
export function useHistoryFacts({ stationId, enabled, level, observed, flood, todayStart, offsetMs = 0 }) {
  const [state, setState] = useState({ status: 'idle' })
  const observedRef = useRef(observed)
  observedRef.current = observed
  const rounded = level == null ? null : Math.round(level * 10) / 10
  const todayKey = todayStart?.getTime()
  const minor = flood?.minor

  useEffect(() => {
    if (!enabled || rounded == null || !todayKey) return
    let cancelled = false
    setState((s) => (s.stationId === stationId && s.status === 'ok' ? s : { status: 'loading', stationId }))
    ;(async () => {
      const datums = await fetchDatums(stationId).catch(() => null)
      const mean = datums?.msl ?? null
      const dir = mean != null && rounded < mean ? 'low' : 'high'
      const before = new Date(todayKey)
      const opts = { before, observed: observedRef.current ?? [], offsetMs }
      const [current, lastFlood, rec] = await Promise.all([
        lastBeyond(stationId, rounded, dir, opts),
        minor != null ? lastBeyond(stationId, minor, 'high', opts) : null,
        records(stationId),
      ])
      if (!cancelled) setState({ status: 'ok', stationId, data: { level: rounded, dir, current, lastFlood, records: rec, mean } })
    })().catch((e) => !cancelled && setState({ status: 'error', stationId, message: e.message }))
    return () => { cancelled = true }
  }, [stationId, enabled, rounded, todayKey, minor, offsetMs])

  return state.stationId === stationId ? state : { status: enabled ? 'loading' : 'idle' }
}

/** NOAA flood thresholds (feet above MLLW) for the station, or null. */
export function useFloodLevels(stationId) {
  const [state, setState] = useState({ stationId: null, levels: null })
  useEffect(() => {
    let cancelled = false
    fetchFloodLevels(stationId)
      .then((levels) => !cancelled && setState({ stationId, levels }))
      .catch(() => !cancelled && setState({ stationId, levels: null }))
    return () => { cancelled = true }
  }, [stationId])
  return state.stationId === stationId ? state.levels : null
}

/** Which named flood level a height reaches, if any. */
export function floodStage(height, flood) {
  if (!flood || height == null) return null
  if (flood.major != null && height >= flood.major) return 'major'
  if (flood.moderate != null && height >= flood.moderate) return 'moderate'
  if (height >= flood.minor) return 'minor'
  return null
}
