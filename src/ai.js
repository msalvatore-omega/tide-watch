// Optional AI answers to free-form questions, from the Tidely server (server/src/ai.js),
// which gathers NOAA data for the station itself. Hidden unless the server is configured
// and has an AI key. (The everyday briefing and preset questions need no AI: see briefing.js.)
import { ALERTS_API } from './config.js'

async function call(path, body) {
  const res = await fetch(`${ALERTS_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `The AI service isn't available (${res.status}).`)
  return json
}

let statusPromise
/** Whether AI features are available (asked once per visit). */
export function aiAvailable() {
  if (!ALERTS_API) return Promise.resolve(false)
  statusPromise ??= call('/ai/status').then((s) => Boolean(s.enabled), () => false)
  return statusPromise
}

export const fetchBriefing = (stationId) => call('/ai/briefing', { stationId })
export const askTidely = (stationId, question) => call('/ai/ask', { stationId, question })
