// Tidely service worker: shows notifications, including push messages from the
// alerts server that arrive while the app is closed. Tapping one opens the station.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

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
