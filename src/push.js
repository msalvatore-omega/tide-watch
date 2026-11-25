// Background alerts: registers this device with the Tidely alerts server so
// notifications arrive even when the app is closed (Web Push).
import { ALERTS_API } from './config.js'

export const pushSupported = () =>
  Boolean(ALERTS_API) && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'

/** iPhone/iPad only allow web push for apps added to the Home Screen. */
export const needsHomeScreen = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone

async function api(path, body) {
  const res = await fetch(`${ALERTS_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Alerts server error (${res.status})`)
  return json
}

const keyBytes = (b64url) => {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

const serverSettings = ({ mode, feet, surgeFeet }) => ({ mode, feet, surgeFeet })

/** Subscribe (or re-use this device's subscription) and tell the server what to watch. */
export async function enablePush(station, settings) {
  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await api('/vapid')
  let sub = await reg.pushManager.getSubscription()
  const currentKey = sub?.options?.applicationServerKey
  if (sub && currentKey && btoa(String.fromCharCode(...new Uint8Array(currentKey))) !== btoa(String.fromCharCode(...keyBytes(publicKey)))) {
    await sub.unsubscribe() // server key changed: start over
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  await api('/subscribe', { subscription: sub.toJSON(), stationId: station.id, stationName: station.name, settings: serverSettings(settings) })
}

/** Keep the server in sync when the station or alert settings change. */
export async function syncPush(station, settings) {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (!sub) throw new Error('This device is no longer subscribed.')
  await api('/subscribe', { subscription: sub.toJSON(), stationId: station.id, stationName: station.name, settings: serverSettings(settings) })
}

export async function disablePush() {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (!sub) return
  await api('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}

export async function sendTestPush() {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (!sub) throw new Error('This device is not subscribed.')
  await api('/test', { endpoint: sub.endpoint })
}
