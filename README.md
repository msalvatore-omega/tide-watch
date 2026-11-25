# 🌊 Tidely

A phone-friendly web app that shows where the tide is right now, when the next
high and low tides are, and alerts you to unusually large tide swings.

Data comes from NOAA's free [CO-OPS Tides & Currents API](https://api.tidesandcurrents.noaa.gov/api/prod/)
(no API key needed). Zip-code search uses [Zippopotam.us](https://zippopotam.us).

## Language and units

Tidely speaks the way tide tables and mariners do: **high water / low water** (HW / LW),
**flood** and **ebb**, **stand**, **springs** and **neaps**, **tidal range**, **observed**
vs **predicted**, heights above **chart datum (MLLW)**, wind in **knots** with **Beaufort
force**, current **set** (degrees true) and **drift**, distances in **nautical miles**,
and a **24-hour clock** (a 12-hour option is in the footer). "Flood stage" and "coastal
flooding" always mean water over the land, to keep them apart from the flood tide.

## Features

Four tabs:

**🌊 Now**
- **Live beach scene**: the water sits where the tide is right now: the live gauge
  reading when the station has one (about 300 do), otherwise NOAA's forecast.
- **Right now / next high / next low** with countdowns, and how far the water is above
  or below the forecast.
- **✨ At a glance**: a plain-English summary and one-tap answers ("Lowest tide this
  weekend?", "Any flooding this week?"), written by rules from the app's own data.
  No AI, no server, works offline. An optional "Ask AI" box for free-form questions
  appears when the server has an AI key (see below).
- **Conditions**: wind, water and air temperature, pressure trend, sunrise/sunset,
  moon phase and spring/neap tides.
- **Chart**: 9 hours back to 24 hours ahead; measured water over the forecast, with
  NOAA's flood levels drawn in. Flood warnings when the gauge or a coming high tide
  reaches them.
- **History** (gauge stations): the last time the water was this high or low, the last
  flood, and all-time records with dates.
- **Alerts**: big swings and surge warnings, with levels saved per station and
  "Add to calendar".

**📅 Week**: every high and low for 7 days with sunrise/sunset and moon; printable.

**🧭 Plan**: when the water is above/below a height you choose over the next 7 days,
optionally daylight only.

**🌀 Currents**: slack water and max flood/ebb at the nearest NOAA current station,
with an estimate of what the current is doing now.

Also: search by zip code, name or "📍 Near me" with live-gauge badges; ★ favorites;
installable to a phone's home screen; dark mode; keyboard and screen-reader friendly
(no axe WCAG 2 AA violations); shareable links (`?station=8574680&tab=week`).

**Offline**: the app and the tide data for stations you've viewed (plus favorites) are
saved on the device, so predictions, the Week table and the Planner work with no signal.

**Phone notifications (on hold)**: built but switched off. Set
`NOTIFICATIONS_ENABLED = true` in `src/config.js` to bring them back; background alerts
also need the server (below) deployed.

## Run locally

```bash
npm install
npm run dev
```

```bash
npm test        # 58 unit tests: tide math, alerts, surge, sun/moon, planner, history, currents, briefing
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

A Cloudflare Worker (free plan) for the two things a web page can't do alone: send
alerts while the app is closed, and answer free-form questions with AI.

- Every 5 minutes (cron trigger) it checks each subscribed station: big swings
  starting within 3 hours, and live-gauge surge vs the forecast. It reuses the
  app's own logic (`src/alerts.js`, `src/surge.js`), so alerts match the app.
- Subscriptions, settings and "already sent" state live in one SQLite-backed
  Durable Object. The VAPID key pair is generated on first use and never leaves it.
- Web Push encryption (RFC 8291) and VAPID (RFC 8292) use WebCrypto only.

Endpoints: `GET /vapid`, `POST /subscribe`, `POST /unsubscribe`, `POST /test`, `GET /health`.

**AI questions (optional).** `POST /ai/ask` answers a free-form question about one
station with Claude (`@anthropic-ai/sdk`, default model `claude-opus-5-5`, set by
`AI_MODEL` in `wrangler.jsonc`). The server builds the prompt's data itself from NOAA
for the given station ID, so it can't be used as a general chatbot; limits per visitor
and per day (`AI_PER_VISITOR_DAILY`, `AI_DAILY_LIMIT`) cap the cost. It stays off until
the `ANTHROPIC_API_KEY` secret is set (repository secret of the same name, or
`npx wrangler secret put ANTHROPIC_API_KEY`). `GET /ai/status`, `POST /ai/briefing`.

```bash
cd server
npm install
npm test          # 18 tests: push crypto vs independent libraries, alert engine and AI flow with real NOAA data
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
| `src/currents.js` | Tidal-current state from slack/max events |
| `src/briefing.js` | "At a glance" summary and preset answers (rules, no AI) |
| `src/ai.js` | Client for the optional AI question box |
| `src/alerts.js` | Big-swing detection and calendar (.ics) export |
| `src/components/` | Beach scene, chart, conditions, week table, planner, station picker, alerts |
| `src/push.js` | Registers the device with the alerts server |
| `public/sw.js` | Service worker: offline cache, and notifications |
| `test/` | App unit tests (vitest) |
| `server/` | Alerts server (Cloudflare Worker) |

Tide predictions are for general information only, not for navigation.
