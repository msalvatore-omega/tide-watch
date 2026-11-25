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

  // NOAA reads begin_date in the requested time zone, so the two lists start at
  // different instants. Pair each GMT event with the local one for the same tide:
  // same type and predicted height, with clock times less than a day apart.
  const toUTC = (t) => new Date(t.replace(' ', 'T') + ':00Z')
  const localEvents = (local.predictions ?? []).map((p) => ({ ...p, asUTC: toUTC(p.t) }))

  return gmt.predictions
    .map((p) => {
      const time = toUTC(p.t)
      const match = localEvents.find((l) => l.type === p.type && l.v === p.v && Math.abs(l.asUTC - time) < 24 * 3600e3)
      return match && {
        time,
        local: match.t, // "YYYY-MM-DD HH:MM" at the station
        height: Number(p.v),
        type: p.type, // "H" or "L"
      }
    })
    .filter(Boolean)
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
