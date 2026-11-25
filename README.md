# 🌊 Tidely

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
- **Alerts when the app is closed**: the alerts server (below) checks NOAA every
  5 minutes and sends Web Push notifications to subscribed phones.
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

## Alerts server (`server/`)

A Cloudflare Worker (free plan) that sends alerts while the app is closed.

- Every 5 minutes (cron trigger) it checks each subscribed station: big swings
  starting within 3 hours, and live-gauge surge vs the forecast. It reuses the
  app's own logic (`src/alerts.js`, `src/surge.js`), so alerts match the app.
- Subscriptions, settings and "already sent" state live in one SQLite-backed
  Durable Object. The VAPID key pair is generated on first use and never leaves it.
- Web Push encryption (RFC 8291) and VAPID (RFC 8292) use WebCrypto only.

Endpoints: `GET /vapid`, `POST /subscribe`, `POST /unsubscribe`, `POST /test`, `GET /health`.

```bash
cd server
npm install
npm test          # crypto checked against independent libraries; engine tested with real NOAA data
npx wrangler dev  # local server on :8787 (add --test-scheduled, then GET /__scheduled)
```

**Deploy** (`.github/workflows/deploy-server.yml`): add repository secrets
`CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`.
Every push that touches the server then tests and deploys it. Point the site at it
by setting `ALERTS_API` in `src/config.js` to the Worker's URL.

On iPhone/iPad, web push only works after adding the site to the Home Screen (iOS 16.4+).

## Project layout

| Path | What it does |
|---|---|
| `src/noaa.js` | NOAA API client, station list, zip lookup |
| `src/tides.js` | Tide math (interpolation) and formatting |
| `src/live.js` | Live gauge readings: 6-minute refresh, measured vs predicted |
| `src/alerts.js` | Big-swing detection and calendar (.ics) export |
| `src/components/` | Beach scene, chart, station picker, alerts panel |
| `src/push.js` | Registers the device with the alerts server |
| `public/sw.js` | Service worker: shows notifications, including background pushes |
| `server/` | Alerts server (Cloudflare Worker) |

Tide predictions are for general information only, not for navigation.
