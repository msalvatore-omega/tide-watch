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
and a **24-hour clock** (a 12-hour option is in the footer). Heights are in feet and
temperatures in °F by default; metres and °C can be chosen under ⓘ (speeds stay in knots). "Flood stage" and "coastal
flooding" always mean water over the land, to keep them apart from the flood tide.

## Features

Tidely is built to be read at a glance: instruments and charts first, words on demand.
Every graphic carries a spoken description for screen readers.

**Now**
- **One graphic**: the height of tide in large figures with flood/ebb/stand, a level
  gauge, and the tide curve on the same scale (9 hours back, scrolling sideways to 7 days ahead): observed water
  over the prediction, HW/LW marked, flood stage drawn in.
- **Next high and low water** side by side, soonest first, then one line of present
  conditions (wind, air and sea temperature, barometer with trend).
- **One row of warnings**: coastal flooding, surge, large range, and National Weather
  Service warnings for the station's waters (never served from the offline cache).
- **Folded rows**, opened on demand: marine forecast, sun and moon (with moonrise and moonset), by-your-rules lights,
  quick answers (rules, no AI; optional AI box when the server has a key), history
  scale and facts, large ranges with alert levels and calendar export.

**📅 Week**: one small tide curve per day (night shaded, HW/LW marked, large ranges
ringed); the full table is one tap away and is what prints.

**🧭 Plan**: drag a line on the tide curve to set a height; each day is a 24-hour bar
with the usable windows filled in. Above/below, daylight-only, tap a window for times.
Also **My berth** (charted depth + draft → depth now, under-keel clearance, when the
boat is predicted to touch bottom) and the rules behind the lights.

**Help**: a first-visit tour, a ? on every panel (how to read it, and its terms), tappable
terms, and a glossary under ⓘ.

**Map** tab (OpenStreetMap, loaded on demand): each tide gauge in view is labelled with
the height of tide it is reading now and a rising/falling arrow; tap a station for its
reading, next high and low water, wind and temperatures, then make it your station or
star it. Shows your own position on request.

Also: search by zip code, name or nearest, with tide-gauge badges; ★ favorites; a **share** button (picture card + link);
installable to a phone's home screen; dark mode; no axe WCAG 2 AA violations;
shareable links (`?station=8574680&tab=week`).

**Offline**: the app and the tide data for stations you've viewed (plus favorites) are
saved on the device, so predictions, the Week and Plan tabs work with no signal.

**Phone notifications (on hold)**: built but switched off. Set
`NOTIFICATIONS_ENABLED = true` in `src/config.js` to bring them back; background alerts
also need the server (below) deployed.

## Version history

The 🕘 button at the bottom of every page opens "What's new": every version of Tidely
and what changed, written for users. It reads from `src/changelog.js`.

**Every user-visible change gets an entry there, in the same commit**, and `version` in
`package.json` is bumped to match. `npm test` fails if the two disagree or an entry is
malformed, so an undocumented release cannot deploy. The full rule is in `CLAUDE.md`.

## Run locally

```bash
npm install
npm run dev
```

```bash
npm test        # 78 unit tests: tide math, alerts, surge, sun/moon, planner, history, map readings, briefing, changelog
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
| `src/astro.js` | Sunrise/sunset, moon phase, moonrise/moonset |
| `src/history.js` | Flood levels, "last time this high/low", records |
| `src/favorites.js` | Favorite stations |
| `src/briefing.js` | "At a glance" summary and preset answers (rules, no AI) |
| `src/ai.js` | Client for the optional AI question box |
| `src/insight.js` | Height in context, gauge-vs-prediction agreement, berth depth, by-your-rules lights |
| `src/nws.js` | National Weather Service marine warnings and forecast |
| `src/glossary.js` | Term definitions and the "how to read this" text for each panel |
| `src/changelog.js` | Version history shown to users (update with every change) |
| `src/alerts.js` | Big-swing detection and calendar (.ics) export |
| `src/components/` | Tide chart with level gauge, sun/moon bar, week strips, planner timeline, station map, history scale, station picker, alerts |
| `src/push.js` | Registers the device with the alerts server |
| `public/sw.js` | Service worker: offline cache, and notifications |
| `test/` | App unit tests (vitest) |
| `server/` | Alerts server (Cloudflare Worker) |

Tide predictions are for general information only, not for navigation.
