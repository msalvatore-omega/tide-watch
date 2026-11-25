// Tidely service worker.
//  1. Offline: keeps the app shell and the NOAA data for stations you've viewed, and
//     serves the saved copies when there's no connection (network first, cache fallback).
//  2. Notifications: shows push messages from the alerts server; tapping opens the station.

const SHELL = 'tidely-shell-v1'
const DATA = 'tidely-data-v1'
const DATA_HOSTS = ['api.tidesandcurrents.noaa.gov', 'api.zippopotam.us']
const DATA_MAX_ENTRIES = 300
const NETWORK_TIMEOUT_MS = 8000

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, DATA])
      for (const name of await caches.keys()) if (name.startsWith('tidely-') && !keep.has(name)) await caches.delete(name)
      await self.clients.claim()
    })(),
  )
})

// ---------- Offline cache ----------

/**
 * Cache key for a NOAA request. "Rolling" requests (a window relative to today) change
 * their dates on every call, so the dates are dropped and the newest copy wins. Requests
 * for a fixed period (one historical month) keep their full URL.
 */
function dataKey(url) {
  const u = new URL(url)
  const p = u.searchParams
  // (The month-long gauge download for History is fetched in fixed chunks; its dates stay.)
  const fixedChunk = p.get('product') === 'water_level' && p.get('range') === '744'
  if (p.has('range') && !fixedChunk) p.delete('begin_date')
  if (p.get('product') === 'monthly_mean') p.delete('end_date')
  p.sort()
  return u.toString()
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

async function trim(cache) {
  const keys = await cache.keys()
  if (keys.length > DATA_MAX_ENTRIES) for (const k of keys.slice(0, keys.length - DATA_MAX_ENTRIES + 50)) await cache.delete(k)
}

async function dataRequest(request) {
  const cache = await caches.open(DATA)
  const key = dataKey(request.url)
  try {
    const res = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS)
    if (res.ok) {
      await cache.put(key, res.clone())
      trim(cache)
    }
    return res
  } catch (err) {
    const saved = await cache.match(key)
    if (saved) return saved
    throw err
  }
}

async function shellRequest(request, event) {
  const cache = await caches.open(SHELL)
  const url = new URL(request.url)
  // Built assets have content-hashed names: safe to serve straight from the cache.
  if (url.pathname.includes('/assets/')) {
    const hit = await cache.match(request.url, { ignoreVary: true })
    if (hit) return hit
  }
  // Page loads are stored under one key, whatever ?station=… they carry.
  const key = request.mode === 'navigate' ? self.registration.scope : request.url
  try {
    const res = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS)
    if (res.ok) event.waitUntil(cache.put(key, res.clone()))
    return res
  } catch (err) {
    const saved = await cache.match(key, { ignoreVary: true })
    if (saved) return saved
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // The big station lists (up to 3 MB) are kept, trimmed, in the app's own storage instead.
  if (DATA_HOSTS.includes(url.hostname) && url.pathname.endsWith('/stations.json')) return
  if (DATA_HOSTS.includes(url.hostname)) event.respondWith(dataRequest(request))
  else if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) event.respondWith(shellRequest(request, event))
})

// The page tells us which files it loaded, so the very first visit is saved for offline too.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache') return
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      const wanted = new Set(event.data.urls.filter((u) => u.startsWith(self.registration.scope)))
      await Promise.all([...wanted].map(async (u) => {
        const key = u.split('?')[0] === self.registration.scope ? self.registration.scope : u
        if (await cache.match(key)) return
        const res = await fetch(u, { cache: 'reload' }).catch(() => null)
        if (res?.ok) await cache.put(key, res)
      }))
      // Drop assets from older versions of the app.
      for (const req of await cache.keys()) {
        if (new URL(req.url).pathname.includes('/assets/') && !wanted.has(req.url)) await cache.delete(req)
      }
    })(),
  )
})

// ---------- Notifications ----------

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tidely', {
      body: data.body || '',
      tag: data.tag, // same tag as in-app notifications, so they replace rather than duplicate
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => 'focus' in w)
      if (open) return open.navigate(target).then((w) => (w || open).focus()).catch(() => open.focus())
      return self.clients.openWindow(target)
    }),
  )
})
