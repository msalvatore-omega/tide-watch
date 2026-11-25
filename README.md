# 🌊 Tidely

A phone-friendly web app that shows where the tide is right now, when the next
high and low tides are, and alerts you to unusually large tide swings.

Data comes from NOAA's free [CO-OPS Tides & Currents API](https://api.tidesandcurrents.noaa.gov/api/prod/)
(no API key needed). Zip-code search uses [Zippopotam.us](https://zippopotam.us).

## Features

Three tabs:

**🌊 Now**
- **Live beach scene**: the water sits where the tide is right now: the live gauge
  reading when the station has one (about 300 do), otherwise NOAA's forecast.
- **Right now / next high / next low**: measured height, trend and how far it is
  above or below the forecast; countdowns to the next high and low.
- **Conditions**: wind, water and air temperature, pressure trend (from the gauge,
  or the nearest one), sunrise/sunset, moon phase and spring/neap tides.
- **Chart**: 9 hours back to 24 hours ahead; measured water over the forecast.
- **Flood levels**: NOAA's minor/moderate/major flood heights drawn on the chart, a
  warning when water is at flood level or a high tide in the next 24 hours is forecast
  to reach it (including any surge the gauge is showing), and 🌊 marks in the Week table.
- **History** (gauge stations): the last time the water was this high or low, the last
  flood, and all-time records with dates — from NOAA's verified records back to 1902
  for Baltimore, plus recent unverified readings. Cached on the device.
- **Alerts**: big swings (top 10% for the station, or a size you choose) and surge
  warnings (gauge off the forecast by a set amount), with "Add to calendar".

**📅 Week**: every high and low for 7 days with sunrise/sunset and moon; printable.

**🧭 Plan**: when is the water above/below a height you choose over the next 7 days
(e.g. to launch a boat or walk the flats), optionally daylight only.

Also: search by zip code, name or "📍 Near me"; ★ favorite stations; installable to a
phone's home screen; dark mode; shareable links (`?station=8574680&tab=week`).

**Phone notifications (on hold)**: in-app and background push notifications are built
but switched off. Set `NOTIFICATIONS_ENABLED = true` in `src/config.js` to bring them
back; background alerts also need the alerts server (below) deployed.

## Run locally

```bash
npm install
npm run dev
```

```bash
npm test        # 37 unit tests: tide math, alerts, surge, sun/moon, planner, history
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
| `src/live.js` | Live gauge + weather hooks (6-minute refresh) |
| `src/surge.js` | Measured-vs-forecast logic (shared with the server) |
| `src/astro.js` | Sunrise/sunset and moon phase |
| `src/history.js` | Flood levels, "last time this high/low", records |
| `src/favorites.js` | Favorite stations |
| `src/alerts.js` | Big-swing detection and calendar (.ics) export |
| `src/components/` | Beach scene, chart, conditions, week table, planner, station picker, alerts |
| `src/push.js` | Registers the device with the alerts server |
| `public/sw.js` | Service worker: shows notifications, including background pushes |
| `server/` | Alerts server (Cloudflare Worker) |

Tide predictions are for general information only, not for navigation.
