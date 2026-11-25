// Thin client for NOAA CO-OPS (Tides & Currents) public APIs. No API key needed.
// Docs: https://api.tidesandcurrents.noaa.gov/api/prod/
const DATA_API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
const META_API = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'
const APP_NAME = 'tide_watch_react' // NOAA asks clients to identify themselves

const pad = (n) => String(n).padStart(2, '0')
const ymdUTC = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NOAA returned HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
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
  return { id: s.id, name: s.name, state: s.state, lat: s.lat, lng: s.lng }
}

const STATIONS_CACHE_KEY = 'tidewatch.stations.v1'
let stationsPromise

/** Every station that has tide predictions (~3,500). Cached in memory and localStorage. */
export function fetchAllStations() {
  if (stationsPromise) return stationsPromise
  stationsPromise = (async () => {
    try {
      const cached = JSON.parse(localStorage.getItem(STATIONS_CACHE_KEY))
      if (cached && Date.now() - cached.savedAt < 7 * 24 * 3600e3) return cached.stations
    } catch { /* storage unavailable — just fetch */ }

    const json = await getJson(`${META_API}/stations.json?type=tidepredictions`)
    const stations = json.stations.map((s) => ({ id: s.id, name: s.name, state: s.state, lat: s.lat, lng: s.lng }))
    try {
      localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), stations }))
    } catch { /* quota/private mode — fine */ }
    return stations
  })()
  stationsPromise.catch(() => { stationsPromise = undefined })
  return stationsPromise
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
