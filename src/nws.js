// National Weather Service: marine warnings in force and the marine forecast for the
// waters around a station. Free, no key (https://www.weather.gov/documentation/services-web-api).
// Never cached for offline use: an old warning must not be shown as current.

const API = 'https://api.weather.gov'

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/geo+json' } })
  if (!res.ok) throw new Error(`National Weather Service returned ${res.status}`)
  return res.json()
}

const zoneMemo = new Map()
/** The coastal / marine forecast zone containing a point, or null inland or outside the US. */
export function marineZone(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (!zoneMemo.has(key)) {
    zoneMemo.set(key, getJson(`${API}/zones?type=coastal&point=${key}`)
      .then((j) => {
        const p = j.features?.[0]?.properties
        return p ? { id: p.id, name: p.name } : null
      })
      .catch((e) => { zoneMemo.delete(key); throw e }))
  }
  return zoneMemo.get(key)
}

const SEVERITY = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 }

/** Keep warnings still in force at `now`, most severe first, one per event name. */
export function currentAlerts(features, now) {
  const seen = new Set()
  return (features ?? [])
    .map((f) => f.properties)
    .filter((p) => p && p.status === 'Actual' && p.messageType !== 'Cancel')
    .map((p) => ({
      id: p.id,
      event: p.event,
      severity: p.severity,
      rank: SEVERITY[p.severity] ?? 0,
      onset: p.onset ? new Date(p.onset) : null,
      ends: new Date(p.ends ?? p.expires),
      headline: p.headline ?? '',
      description: p.description ?? '',
      instruction: p.instruction ?? '',
      area: p.areaDesc ?? '',
    }))
    .filter((a) => !(a.ends <= now))
    .sort((a, b) => b.rank - a.rank || (a.onset ?? 0) - (b.onset ?? 0))
    .filter((a) => (seen.has(a.event) ? false : seen.add(a.event)))
}

/** { zone, alerts (raw features), forecast: [{ name, text }], updated } for a point. */
export async function fetchMarine(lat, lng) {
  const zone = await marineZone(lat, lng).catch(() => null)
  const point = `${lat.toFixed(3)},${lng.toFixed(3)}`
  // Warnings for the water (the marine zone) and for the shore at the station itself
  // (coastal flood advisories are issued for the land).
  const [alerts, forecast] = await Promise.allSettled([
    Promise.allSettled([
      zone ? getJson(`${API}/alerts/active?zone=${zone.id}`) : Promise.resolve({ features: [] }),
      getJson(`${API}/alerts/active?point=${point}`),
    ]).then((both) => {
      if (both.every((r) => r.status === 'rejected')) throw both[0].reason
      const byId = new Map()
      for (const r of both) for (const f of r.status === 'fulfilled' ? r.value.features ?? [] : []) byId.set(f.properties?.id, f)
      return { features: [...byId.values()] }
    }),
    zone ? getJson(`${API}/zones/forecast/${zone.id}/forecast`) : Promise.resolve(null),
  ])
  if (alerts.status === 'rejected' && forecast.status === 'rejected') throw alerts.reason
  const fc = forecast.status === 'fulfilled' ? forecast.value?.properties : null
  return {
    zone,
    alerts: alerts.status === 'fulfilled' ? alerts.value.features ?? [] : null,
    forecast: (fc?.periods ?? []).map((p) => ({ name: p.name, text: p.detailedForecast })),
    updated: fc?.updated ? new Date(fc.updated) : null,
    fetchedAt: new Date(),
  }
}
