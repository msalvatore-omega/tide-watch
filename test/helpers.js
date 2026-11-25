// Shared test setup: real Baltimore (8574680) NOAA responses saved on 2026-11-25.
import { readFileSync } from 'node:fs'
import { vi } from 'vitest'

export const fixture = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, import.meta.url)))
export const NOW = new Date('2026-11-25T20:00:00Z') // 3:00 PM EST at the station
export const EST = -5 * 3600e3
export const BALTIMORE = { id: '8574680', lat: 39.2667, lng: -76.5783 }

/** Replace global fetch with a router: (URL) => JSON body, or { status, body }. */
export function mockFetch(route) {
  const calls = []
  vi.stubGlobal('fetch', async (url) => {
    const u = new URL(url)
    calls.push(u)
    const out = await route(u)
    const { status = 200, body = out } = out && out.__response ? out : {}
    return new Response(JSON.stringify(body), { status })
  })
  return calls
}
export const respond = (status, body) => ({ __response: true, status, body })
export const noData = () => respond(400, { error: { message: 'No data was found.' } })

/** Events exactly as the app builds them, from the saved NOAA high/low lists. */
export async function baltimoreEvents() {
  mockFetch((u) => fixture(`hilo-${u.searchParams.get('time_zone')}`))
  const { fetchHiLo } = await import('../src/noaa.js')
  return fetchHiLo('8574680')
}
