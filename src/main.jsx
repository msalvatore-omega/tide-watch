import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { setClock24, setMetric } from './tides.js'

// Mariners' 24-hour clock unless the user chose the 12-hour style.
try { setClock24(localStorage.getItem('tidely.clock') !== '12') } catch { setClock24(true) }

try { setMetric(localStorage.getItem('tidely.units') === 'metric') } catch { /* feet */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker: offline support and notifications (see public/sw.js).
if ('serviceWorker' in navigator) {
  const firstVisit = !navigator.serviceWorker.controller
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js')
      const reg = await navigator.serviceWorker.ready
      const loaded = performance.getEntriesByType('resource').map((e) => e.name)
      // Tell it which files this page loaded, so even a first visit works offline next time.
      reg.active?.postMessage({ type: 'precache', urls: [location.href, ...loaded].filter((u) => u.startsWith(location.origin)) })
      // On a first visit the tide data arrived before the service worker was in control,
      // so it wasn't saved. Ask for the small requests again; this time they're kept.
      if (firstVisit) {
        await new Promise((r) => setTimeout(r, 3000))
        const requested = performance.getEntriesByType('resource').map((e) => e.name) // by now the data has loaded
        const again = [...new Set(requested)].filter((u) => u.includes('tidesandcurrents.noaa.gov') && !/monthly_mean|range=744&.*water_level|water_level.*range=744/.test(u))
        for (const u of again) await fetch(u).catch(() => {})
      }
    } catch { /* offline support is optional */ }
  })
}
