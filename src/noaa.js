// Thin client for NOAA CO-OPS (Tides & Currents) public APIs. No API key needed.
// Docs: https://api.tidesandcurrents.noaa.gov/api/prod/
const DATA_API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
const META_API = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'
const APP_NAME = 'tidely' // NOAA asks clients to identify themselves

// NOAA lists some stations in ALL CAPS; show those in title case.
const title = (n) =>
  n && n === n.toUpperCase()
    ? n.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/ (Of|The|And|At|On|In)\b/g, (w) => w.toLowerCase())
    : n

const pad = (n) => String(n).padStart(2, '0')
const ymdUTC = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`

async function getJson(url) {
  const res = await fetch(url)
  // NOAA reports "no data for this station" as HTTP 400 with a JSON error body.
  const json = await res.json().catch(() => null)
  if (!json) throw new Error(`NOAA returned HTTP ${res.status}`)
  if (json.error) {
    // NOAA answered but has no such data (e.g. no live gauge) — not a network problem.
    const err = new Error(json.error.message)
    err.noData = true
    throw err
  }
  return json
}

/**
 * High/low tide predictions from yesterday through ~30 days out
 * Fetched twice: once in GMT (for exact math against "now") and once in station
 * local time (so times are shown the way locals read them, wherever the viewer is).
 * (31 days covers a full spring/neap cycle, the baseline for swing alerts.)
 */
export async function fetchHiLo(stationId) {
  const begin = new Date(Date.now() - 24 * 3600e3)
  const base =
    `${DATA_API}?product=predictions&interval=hilo&datum=MLLW&units=english&format=json` +
    `&station=${encodeURIComponent(stationId)}&begin_date=${ymdUTC(begin)}&range=744&application=${APP_NAME}`

  const [gmt, local] = await Promise.all([
    getJson(`${base}&time_zone=gmt`),
    getJson(`${base}&time_zone=lst_ldt`),
  ])
  if (!gmt.predictions?.length) throw new Error('No tide predictions for this station.')

  // NOAA reads begin_date in the requested time zone, so the two lists are the same
  // sequence of tides starting at different instants: one is the other shifted by a
  // few positions. Find that shift (the one where types and heights line up for the
  // most tides) and pair by position. Matching each tide on height alone is not safe:
  // two consecutive highs can have identical predicted heights.
  const toUTC = (t) => new Date(t.replace(' ', 'T') + ':00Z')
  const g = gmt.predictions
  const l = local.predictions ?? []
  const same = (a, b) => a && b && a.type === b.type && a.v === b.v
  let shift = 0
  let best = -1
  for (let k = -8; k <= 8; k++) {
    let hits = 0
    for (let i = 0; i < g.length; i++) if (same(g[i], l[i + k])) hits++
    if (hits > best) { best = hits; shift = k }
  }

  const events = g
    .map((p, i) => same(p, l[i + shift]) && {
      time: toUTC(p.t),
      local: l[i + shift].t, // "YYYY-MM-DD HH:MM" at the station
      height: Number(p.v),
      type: p.type, // "H" or "L"
    })
    .filter(Boolean)
  if (!events.length) throw new Error('No tide predictions for this station.')
  return events
}

export async function fetchStationInfo(stationId) {
  const json = await getJson(`${META_API}/stations/${encodeURIComponent(stationId)}.json`)
  const s = json.stations?.[0]
  if (!s) throw new Error(`Station ${stationId} not found.`)
  return { id: s.id, name: title(s.name), state: s.state, lat: s.lat, lng: s.lng }
}

const stationLists = {}

// Station lists change rarely: cache in memory and localStorage for a week.
function fetchStationList(type) {
  if (stationLists[type]) return stationLists[type]
  const cacheKey = `tidewatch.stations.${type}.v2`
  stationLists[type] = (async () => {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey))
      if (cached && Date.now() - cached.savedAt < 7 * 24 * 3600e3) return cached.stations
    } catch { /* storage unavailable — just fetch */ }

    const json = await getJson(`${META_API}/stations.json?type=${type}`)
    const stations = json.stations.map((s) => ({ id: s.id, name: title(s.name), state: s.state, lat: s.lat, lng: s.lng }))
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), stations }))
    } catch { /* quota/private mode — fine */ }
    return stations
  })()
  stationLists[type].catch(() => { delete stationLists[type] })
  return stationLists[type]
}

/** Every station that has tide predictions (~3,500). */
export const fetchAllStations = () => fetchStationList('tidepredictions')

/** Stations with a live water-level gauge (~300). */
export const fetchLiveStations = () => fetchStationList('waterlevels')

/**
 * Live gauge readings (every 6 minutes, ~5-10 min delay) for the last 26 hours,
 * plus NOAA's exact 6-minute predictions over the same span (and 8 hours ahead)
 * so measured and predicted can be compared point for point.
 * Readings are NOAA "preliminary" data: not yet quality-checked.
 */
export async function fetchLive(stationId) {
  const begin = new Date(Date.now() - 26 * 3600e3)
  const beginParam = encodeURIComponent(`${ymdUTC(begin)} ${pad(begin.getUTCHours())}:${pad(begin.getUTCMinutes())}`)
  const common =
    `${DATA_API}?datum=MLLW&units=english&time_zone=gmt&format=json` +
    `&station=${encodeURIComponent(stationId)}&begin_date=${beginParam}&application=${APP_NAME}`
  const [obs, pred] = await Promise.all([
    getJson(`${common}&product=water_level&range=27`),
    getJson(`${common}&product=predictions&range=34`),
  ])
  const toPoints = (rows) =>
    (rows ?? [])
      .filter((r) => r.v !== '' && r.v != null)
      .map((r) => ({ time: new Date(r.t.replace(' ', 'T') + ':00Z'), height: Number(r.v) }))
  return { observed: toPoints(obs.data), predicted: toPoints(pred.predictions) }
}

/** Great-circle distance in miles. */
export function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** US zip code → { lat, lng, place } via the free Zippopotam.us service (no key needed). */
export async function lookupZip(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`)
  if (res.status === 404) throw new Error(`Zip code ${zip} not found.`)
  if (!res.ok) throw new Error(`Zip lookup failed (HTTP ${res.status}).`)
  const p = (await res.json()).places[0]
  return { lat: Number(p.latitude), lng: Number(p.longitude), place: `${p['place name']}, ${p['state abbreviation']}` }
}

const sixMinBegin = (hoursAgo) => {
  const d = new Date(Date.now() - hoursAgo * 3600e3)
  return encodeURIComponent(`${ymdUTC(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`)
}

/**
 * For the "Now" view: NOAA's exact 6-minute predictions from 26 hours ago to 26 hours
 * ahead, plus measured gauge readings for the last 26 hours. Either is [] when the
 * station doesn't publish it (no gauge, or a highs/lows-only station).
 */
export async function fetchSixMinute(stationId) {
  const common =
    `${DATA_API}?datum=MLLW&units=english&time_zone=gmt&format=json` +
    `&station=${encodeURIComponent(stationId)}&begin_date=${sixMinBegin(26)}&application=${APP_NAME}`
  const [pred, obs] = await Promise.allSettled([
    getJson(`${common}&product=predictions&range=52`),
    getJson(`${common}&product=water_level&range=27`),
  ])
  // Smaller ("subordinate") stations publish only highs/lows, not 6-minute values,
  // and most have no gauge: treat "no data" as empty rather than an error.
  for (const r of [pred, obs]) if (r.status === 'rejected' && !r.reason.noData) throw r.reason
  const toPoints = (rows) =>
    (rows ?? [])
      .filter((r) => r.v !== '' && r.v != null)
      .map((r) => ({ time: new Date(r.t.replace(' ', 'T') + ':00Z'), height: Number(r.v) }))
  return {
    predicted: pred.status === 'fulfilled' ? toPoints(pred.value.predictions) : [],
    observed: obs.status === 'fulfilled' ? toPoints(obs.value.data) : [],
  }
}

/**
 * Latest weather at a gauge: wind (knots), water and air temperature (°F) and air
 * pressure (mb, with the change over ~3 hours). Each is null if the gauge lacks it.
 */
export async function fetchConditions(stationId) {
  const base = `${DATA_API}?units=english&time_zone=gmt&format=json&station=${encodeURIComponent(stationId)}&application=${APP_NAME}`
  const latest = (product) => getJson(`${base}&product=${product}&date=latest`).then((j) => j.data?.at(-1) ?? null, () => null)
  const [wind, water, air, pressure] = await Promise.all([
    latest('wind'),
    latest('water_temperature'),
    latest('air_temperature'),
    getJson(`${base}&product=air_pressure&begin_date=${sixMinBegin(3)}&range=4`).then((j) => j.data ?? [], () => []),
  ])
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
  const time = (r) => (r ? new Date(r.t.replace(' ', 'T') + ':00Z') : null)
  const p = pressure.filter((r) => num(r.v) != null)
  return {
    wind: wind && num(wind.s) != null ? { knots: num(wind.s), gust: num(wind.g), dir: wind.dr, deg: num(wind.d), time: time(wind) } : null,
    waterTemp: water && num(water.v) != null ? { f: num(water.v), time: time(water) } : null,
    airTemp: air && num(air.v) != null ? { f: num(air.v), time: time(air) } : null,
    pressure: p.length ? { mb: num(p.at(-1).v), change3h: p.length > 1 ? num(p.at(-1).v) - num(p[0].v) : null, time: time(p.at(-1)) } : null,
  }
}

// ---------- Flood levels and history ----------

const mdapi = (stationId, what) => getJson(`${META_API}/stations/${encodeURIComponent(stationId)}/${what}.json?units=english`)

const cache = {
  get(key, maxAgeMs) {
    try {
      const c = JSON.parse(localStorage.getItem(key))
      return c && Date.now() - c.savedAt < maxAgeMs ? c.value : null
    } catch { return null }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value })) } catch { /* quota/private mode */ }
  },
}
// In-memory request memo. Entries expire so a tab left open for days picks up new data.
const HOUR = 3600e3
const memo = new Map()
const once = (key, fn, maxAgeMs = 24 * HOUR) => {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.promise
  const promise = fn().catch((e) => { memo.delete(key); throw e })
  memo.set(key, { at: Date.now(), promise })
  return promise
}

/** Tidal datums converted to feet above MLLW (the app's zero). */
export const fetchDatums = (stationId) =>
  once(`datums:${stationId}`, async () => {
    const d = await mdapi(stationId, 'datums')
    const get = (n) => d.datums?.find((x) => x.name === n)?.value
    const mllw = get('MLLW')
    if (mllw == null) return null
    const rel = (n) => (get(n) == null ? null : Math.round((get(n) - mllw) * 100) / 100)
    return { mllwStnd: mllw, msl: rel('MSL'), mhhw: rel('MHHW') }
  })

/**
 * NOAA flood thresholds in feet above MLLW: { minor, moderate, major }, or null when
 * the station has none. NOAA publishes them on the station datum, so we subtract MLLW.
 * Prefers NOAA (NOS) high-tide-flooding levels, else the National Weather Service's.
 */
export const fetchFloodLevels = (stationId) =>
  once(`flood:${stationId}`, async () => {
    const [fl, datums] = await Promise.all([mdapi(stationId, 'floodlevels'), fetchDatums(stationId)])
    if (!datums) return null
    const level = (k) => {
      const v = fl[`nos_${k}`] ?? fl[`nws_${k}`]
      return v == null ? null : Math.round((v - datums.mllwStnd) * 100) / 100
    }
    const out = { minor: level('minor'), moderate: level('moderate'), major: level('major') }
    return out.minor == null ? null : out
  })

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const toTime = (t) => new Date(t.replace(' ', 'T') + ':00Z')

/**
 * Highest and lowest water for every month on record (verified data, usually up to
 * a month or two ago). One request covers back to 1900; cached for a week.
 */
export const fetchMonthlyExtremes = (stationId) =>
  once(`monthly:${stationId}`, async () => {
    const key = `tidely.monthly.${stationId}.v1`
    const hit = cache.get(key, 7 * 24 * 3600e3)
    if (hit) return hit
    const end = new Date()
    const json = await getJson(
      `${DATA_API}?product=monthly_mean&datum=MLLW&units=english&time_zone=gmt&format=json` +
      `&station=${encodeURIComponent(stationId)}&begin_date=19000101&end_date=${ymdUTC(end)}&application=${APP_NAME}`,
    )
    const months = (json.data ?? [])
      .map((m) => ({ y: Number(m.year), m: Number(m.month), hi: num(m.highest), lo: num(m.lowest) }))
      .filter((m) => m.hi != null || m.lo != null)
    cache.set(key, months)
    return months
  })

/**
 * Verified water levels for one month, for pinning down exact dates: the tabulated
 * highs and lows where NOAA has them, else hourly heights (older records, e.g. 1900s).
 */
export const fetchMonthDetail = (stationId, y, m) =>
  once(`month:${stationId}:${y}-${m}`, async () => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const range = `&station=${encodeURIComponent(stationId)}&begin_date=${y}${pad(m)}01&end_date=${y}${pad(m)}${pad(last)}&application=${APP_NAME}`
    const base = `${DATA_API}?datum=MLLW&units=english&time_zone=gmt&format=json${range}`
    for (const product of ['high_low', 'hourly_height']) {
      try {
        const json = await getJson(`${base}&product=${product}`)
        const rows = (json.data ?? []).filter((r) => num(r.v) != null).map((r) => ({ time: toTime(r.t), height: num(r.v) }))
        if (rows.length) return rows
      } catch (e) {
        if (!e.noData) throw e
      }
    }
    return []
  })

/**
 * Daily highest/lowest measured water from `from` up to today, for the weeks NOAA
 * hasn't verified yet. Fetched as 6-minute data in ≤31-day chunks, reduced to one
 * max/min per station-local day (so "before today" never splits a day), and cached
 * on the device for 6 hours.
 */
export const fetchRecentDaily = (stationId, from, offsetMs = 0) =>
  once(`recent:${stationId}:${ymdUTC(from)}:${offsetMs}`, async () => {
    const key = `tidely.recent.${stationId}.${ymdUTC(from)}.${offsetMs}.v2`
    const hit = cache.get(key, 6 * 3600e3)
    if (hit) return hit.map((d) => ({ ...d, maxTime: new Date(d.maxTime), minTime: new Date(d.minTime) }))
    const days = new Map()
    for (let start = new Date(from); start < new Date(); start = new Date(start.getTime() + 31 * 86400e3)) {
      const json = await getJson(
        `${DATA_API}?product=water_level&datum=MLLW&units=english&time_zone=gmt&format=json` +
        `&station=${encodeURIComponent(stationId)}&begin_date=${ymdUTC(start)}&range=${31 * 24}&application=${APP_NAME}`,
      ).catch((e) => { if (e.noData) return { data: [] }; throw e })
      for (const r of json.data ?? []) {
        const v = num(r.v)
        if (v == null) continue
        const day = new Date(toTime(r.t).getTime() + offsetMs).toISOString().slice(0, 10)
        const d = days.get(day)
        if (!d) days.set(day, { day, max: v, maxTime: toTime(r.t), min: v, minTime: toTime(r.t) })
        else {
          if (v > d.max) { d.max = v; d.maxTime = toTime(r.t) }
          if (v < d.min) { d.min = v; d.minTime = toTime(r.t) }
        }
      }
    }
    const list = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1))
    cache.set(key, list)
    return list
  }, 6 * HOUR)

// ---------- Tidal currents ----------

/**
 * Stations with tidal current predictions (~2,700), one entry per location: the
 * shallowest measurement depth, which is what matters to small boats. Skips NOAA's
 * "weak and variable" stations, which have no predictions. Cached for 30 days.
 */
export const fetchCurrentStations = () =>
  once('currentStations', async () => {
    const key = 'tidely.currentStations.v1'
    const hit = cache.get(key, 30 * 24 * HOUR)
    if (hit) return hit
    const json = await getJson(`${META_API}/stations.json?type=currentpredictions`)
    const byId = new Map()
    for (const s of json.stations ?? []) {
      if (s.type === 'W' || s.lat == null) continue
      const cur = byId.get(s.id)
      const shallower = !cur || (s.depth ?? Infinity) < (cur.depth ?? Infinity) || (s.depth == null && cur.depth == null && s.currbin < cur.bin)
      if (shallower) byId.set(s.id, { id: s.id, bin: s.currbin, name: title(s.name), lat: s.lat, lng: s.lng, depth: s.depth ?? null })
    }
    const list = [...byId.values()]
    cache.set(key, list)
    return list
  }, 7 * 24 * HOUR)

/**
 * Slack water and maximum flood/ebb for a current station, from 12 hours ago to
 * 48 hours ahead. Speeds in knots (always positive); directions in degrees true.
 */
export async function fetchCurrents(stationId, bin) {
  const json = await getJson(
    `${DATA_API}?product=currents_predictions&interval=MAX_SLACK&units=english&time_zone=gmt&format=json` +
    `&station=${encodeURIComponent(stationId)}&bin=${encodeURIComponent(bin)}&begin_date=${sixMinBegin(12)}&range=60&application=${APP_NAME}`,
  )
  return (json.current_predictions?.cp ?? []).map((c) => ({
    time: toTime(c.Time),
    type: c.Type, // 'slack' | 'flood' | 'ebb'
    knots: Math.abs(Number(c.Velocity_Major) || 0),
    floodDir: c.meanFloodDir ?? null,
    ebbDir: c.meanEbbDir ?? null,
  }))
}
