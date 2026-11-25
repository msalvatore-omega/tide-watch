# 🌊 Tide Watch

A phone-friendly web app that shows where the tide is right now, when the next
high and low tides are, and alerts you to unusually large tide swings.

Data comes from NOAA's free [CO-OPS Tides & Currents API](https://api.tidesandcurrents.noaa.gov/api/prod/)
(no API key needed). Zip-code search uses [Zippopotam.us](https://zippopotam.us).

## Features

- **Live beach scene**: the water sits where the tide is now, rising or falling.
- **Predicted / Live switch**: predicted tides (astronomical forecast, ~3,500
  stations) or the live gauge reading (measured every 6 minutes at ~300 stations),
  with how far the water is above or below the forecast. Stations without a gauge
  offer the nearest one.
- **Surge warnings**: a banner and notification when the live gauge is off the
  forecast by your chosen amount (0.5–3 ft, default 1 ft, or off) — wind or storm
  surge. Notifies once per surge; checked every 6 minutes in the background while
  notifications are on, even in the Predicted view.
- **Next high / low tide** with countdowns, in the station's local time.
- **24-hour tide chart** with a "Now" marker.
- **Find a station** by zip code, town or beach name, or "📍 Near me".
- **Big-swing alerts**: flags swings in the top 10% for that station this month
  (or above a size you choose), with a banner, browser notifications while the
  app is open, and an "Add to calendar" file for reminders when it's closed.
- Installable to a phone's home screen; dark mode; shareable links
  (`?station=8574680&mode=live`).

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` also prints a Network URL you can open on a phone on the same Wi-Fi.

## Deploy

**GitHub Pages (set up in `.github/workflows/deploy.yml`).** Every push to `main`
builds and publishes the site. One-time step: in the repository, go to
**Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
The site appears at `https://<your-username>.github.io/<repo-name>/`.

**Netlify / Vercel / Cloudflare Pages (optional).** Import the repository; build
command `npm run build`, output folder `dist` (already in `netlify.toml`).

## Project layout

| Path | What it does |
|---|---|
| `src/noaa.js` | NOAA API client, station list, zip lookup |
| `src/tides.js` | Tide math (interpolation) and formatting |
| `src/live.js` | Live gauge readings: 6-minute refresh, measured vs predicted |
| `src/alerts.js` | Big-swing detection and calendar (.ics) export |
| `src/components/` | Beach scene, chart, station picker, alerts panel |
| `public/sw.js` | Service worker, so phones can show notifications |

Tide predictions are for general information only, not for navigation.
