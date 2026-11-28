// The alerts engine: stores subscriptions and, on each scheduled run, checks NOAA for
// every subscribed station and sends push notifications. Uses the web app's own
// alert logic, so the server alerts on exactly what the app shows.
//
// `sql` is a Durable Object SQLite handle (or anything with the same exec() API).

import { fetchHiLo, fetchLive } from '../../src/noaa.js'
import { findAlerts } from '../../src/alerts.js'
import { liveNow, diffText } from '../../src/surge.js'
import { formatStationTime, setClock24 } from '../../src/tides.js'
import { sendPush, generateVapidKeys, b64u } from './webpush.js'
import { generate, buildContext, AiError } from './ai.js'

const SWING_LEAD_MS = 3 * 3600e3 // notify ~3 hours before a big swing
const HILO_MAX_AGE_MS = 12 * 3600e3 // refresh cached predictions twice a day
const MAX_READING_AGE_MS = 60 * 60e3 // ignore gauge readings older than an hour
const SUBSCRIPTION_LIMIT = 2000

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS subs (
    id TEXT PRIMARY KEY,           -- SHA-256 of the push endpoint
    sub TEXT NOT NULL,             -- browser PushSubscription JSON
    station_id TEXT NOT NULL,
    station_name TEXT NOT NULL,
    settings TEXT NOT NULL,        -- { mode, feet, surgeFeet }
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_test INTEGER
  );
  CREATE TABLE IF NOT EXISTS sent (sub_id TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (sub_id, key));
  CREATE TABLE IF NOT EXISTS surge (sub_id TEXT PRIMARY KEY, dir TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ai_usage (day TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, who));
`

const rows = (cursor) => [...cursor]

async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const reviveEvents = (list) => list.map((e) => ({ ...e, time: new Date(e.time) }))

export function cleanSettings(s = {}) {
  const num = (v, lo, hi) => (typeof v === 'number' && v >= lo && v <= hi ? v : null)
  return {
    mode: s.mode === 'custom' ? 'custom' : 'auto',
    feet: num(s.feet, 0.1, 50) ?? 6,
    surgeFeet: s.surgeFeet === null ? null : num(s.surgeFeet, 0.1, 20) ?? 1,
  }
}

setClock24(true) // mariners' usage, the same as the app: 19:06, not 7:06 PM

/** Whether the browser's public key is a real point on the P-256 curve (so it can be encrypted to). */
export async function usableKey(sub) {
  try {
    await crypto.subtle.importKey('raw', b64u.decode(sub.keys.p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    return true
  } catch {
    return false
  }
}

export function validSubscription(sub) {
  try {
    const url = new URL(sub.endpoint)
    const localTest = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const p256dh = b64u.decode(sub.keys.p256dh) // uncompressed P-256 point
    const auth = b64u.decode(sub.keys.auth)
    return (url.protocol === 'https:' || localTest) && p256dh.length === 65 && p256dh[0] === 4 && auth.length === 16
  } catch {
    return false
  }
}

export class Engine {
  constructor(sql, { subject, siteUrl, log = () => {}, ai = {} }) {
    this.sql = sql
    this.subject = subject // contact for push services, e.g. a site URL
    this.siteUrl = siteUrl
    this.log = log
    // ai: { apiKey, model, dailyLimit, perVisitorLimit, client? (tests) }
    this.ai = { model: 'claude-opus-5-5', dailyLimit: 300, perVisitorLimit: 25, ...ai }
    sql.exec(SCHEMA)
  }

  // ---------- AI briefing and questions ----------

  aiEnabled() { return Boolean(this.ai.apiKey || this.ai.client) }

  /** Count one AI call against today's totals; throws when a limit is reached. */
  aiSpend(who, now) {
    const day = new Date(now).toISOString().slice(0, 10)
    const count = (k) => rows(this.sql.exec('SELECT n FROM ai_usage WHERE day = ? AND who = ?', day, k))[0]?.n ?? 0
    if (count('*') >= this.ai.dailyLimit) throw new AiError("Today's AI limit for Tidely has been reached. It resets at midnight UTC.", 429)
    if (count(who) >= this.ai.perVisitorLimit) throw new AiError("You've reached today's limit for AI answers. It resets at midnight UTC.", 429)
    for (const k of ['*', who]) {
      this.sql.exec('INSERT INTO ai_usage (day, who, n) VALUES (?, ?, 1) ON CONFLICT(day, who) DO UPDATE SET n = n + 1', day, k)
    }
    this.sql.exec('DELETE FROM ai_usage WHERE day < ?', new Date(now - 3 * 86400e3).toISOString().slice(0, 10))
  }

  async aiRun(stationId, question, who, now) {
    if (!this.aiEnabled()) throw new AiError('AI features are not set up on this server.', 503)
    if (!/^[A-Za-z0-9]{1,16}$/.test(stationId ?? '')) throw new AiError('Invalid station.', 400)
    const events = await this.hilo(stationId, now)
    const context = await buildContext(stationId, events, now)
    this.aiSpend(who, now)
    const out = await generate({ apiKey: this.ai.apiKey, model: this.ai.model, client: this.ai.client, context, question })
    this.log(`ai ${question ? 'ask' : 'briefing'} ${stationId}: ${out.usage?.input_tokens ?? '?'} in, ${out.usage?.output_tokens ?? '?'} out, ${out.model}`)
    return out.text
  }

  /** Briefing for a station, shared by all visitors for 30 minutes. */
  async aiBriefing(stationId, who, now = Date.now()) {
    const cached = this.getKV(`briefing:${stationId}`)
    if (cached && now - cached.at < 30 * 60e3) return { text: cached.text, generatedAt: cached.at, cached: true }
    const text = await this.aiRun(stationId, null, who, now)
    this.setKV(`briefing:${stationId}`, { at: now, text })
    return { text, generatedAt: now, cached: false }
  }

  async aiAsk(stationId, question, who, now = Date.now()) {
    const q = String(question ?? '').replace(/\s+/g, ' ').trim()
    if (q.length < 3) throw new AiError('Type a question first.', 400)
    if (q.length > 300) throw new AiError('Please keep questions under 300 characters.', 400)
    return { text: await this.aiRun(stationId, q, who, now), generatedAt: now }
  }

  getKV(k) {
    const r = rows(this.sql.exec('SELECT v FROM kv WHERE k = ?', k))[0]
    return r ? JSON.parse(r.v) : null
  }

  setKV(k, v) {
    this.sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v))
  }

  /** VAPID keys are created on first use and kept only in this server's storage. */
  async vapid() {
    let keys = this.getKV('vapid')
    if (!keys) {
      keys = await generateVapidKeys()
      this.setKV('vapid', keys)
    }
    return keys
  }

  async subscribe({ subscription, stationId, stationName, settings }, now = Date.now()) {
    if (!validSubscription(subscription) || !(await usableKey(subscription))) throw new Error('Invalid push subscription.')
    if (!/^[A-Za-z0-9]{1,16}$/.test(stationId ?? '')) throw new Error('Invalid station.')
    const id = await sha256Hex(subscription.endpoint)
    const exists = rows(this.sql.exec('SELECT station_id FROM subs WHERE id = ?', id))[0]
    if (!exists && rows(this.sql.exec('SELECT COUNT(*) AS n FROM subs'))[0].n >= SUBSCRIPTION_LIMIT) {
      throw new Error('Alert server is full.')
    }
    const sub = JSON.stringify({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } })
    this.sql.exec(
      `INSERT INTO subs (id, sub, station_id, station_name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET sub = excluded.sub, station_id = excluded.station_id,
         station_name = excluded.station_name, settings = excluded.settings, updated_at = excluded.updated_at`,
      id, sub, stationId, String(stationName ?? stationId).slice(0, 120), JSON.stringify(cleanSettings(settings)), now, now,
    )
    // A new station starts fresh: forget surge state from the old one.
    if (exists && exists.station_id !== stationId) this.sql.exec('DELETE FROM surge WHERE sub_id = ?', id)
    return { id }
  }

  async unsubscribe(endpoint) {
    const id = await sha256Hex(endpoint ?? '')
    this.removeSub(id)
  }

  removeSub(id) {
    this.sql.exec('DELETE FROM subs WHERE id = ?', id)
    this.sql.exec('DELETE FROM sent WHERE sub_id = ?', id)
    this.sql.exec('DELETE FROM surge WHERE sub_id = ?', id)
  }

  async push(row, message) {
    const status = await sendPush(JSON.parse(row.sub), message, { vapid: await this.vapid(), subject: this.subject })
    if (status === 404 || status === 410) {
      this.log(`subscription ${row.id.slice(0, 8)} expired (${status}); removing`)
      this.removeSub(row.id)
    }
    return status >= 200 && status < 300
  }

  /** "Send test notification" button. Limited to once a minute per device. */
  async test(endpoint, now = Date.now()) {
    const id = await sha256Hex(endpoint ?? '')
    const row = rows(this.sql.exec('SELECT * FROM subs WHERE id = ?', id))[0]
    if (!row) throw new Error('This device is not subscribed.')
    if (row.last_test && now - row.last_test < 60e3) throw new Error('Please wait a minute between tests.')
    this.sql.exec('UPDATE subs SET last_test = ? WHERE id = ?', now, id)
    const ok = await this.push(row, {
      title: 'Tidely alerts are on',
      body: `Standing watch on ${row.station_name}: alerts will arrive even when the app is closed.`,
      tag: 'tidewatch-test',
      url: this.stationUrl(row.station_id),
    })
    if (!ok) throw new Error('The push service rejected the test message.')
    return { ok }
  }

  stationUrl(stationId) {
    return `${this.siteUrl}?station=${encodeURIComponent(stationId)}`
  }

  async hilo(stationId, now) {
    const cached = this.getKV(`hilo:${stationId}`)
    if (cached && now - cached.at < HILO_MAX_AGE_MS) return reviveEvents(cached.events)
    const events = await fetchHiLo(stationId)
    this.setKV(`hilo:${stationId}`, { at: now, events })
    return events
  }

  /** One scheduled run: check every subscribed station and send what's due. */
  async check(now = Date.now()) {
    const nowDate = new Date(now)
    const subs = rows(this.sql.exec('SELECT * FROM subs'))
    const byStation = Map.groupBy(subs, (s) => s.station_id)
    const summary = { stations: byStation.size, subscriptions: subs.length, sent: 0, errors: 0 }

    for (const [stationId, stationSubs] of byStation) {
      try {
        const events = await this.hilo(stationId, now)
        const wantSurge = stationSubs.some((s) => JSON.parse(s.settings).surgeFeet != null)
        let reading = null
        if (wantSurge) {
          try {
            reading = liveNow(await fetchLive(stationId), nowDate)
          } catch (e) {
            // No gauge here, or NOAA's gauge feed is down: skip surge checks this run,
            // but still send swing alerts (they only need the cached predictions).
            if (!e.noData) { summary.errors++; this.log(`station ${stationId} gauge: ${e.message}`) }
          }
        }
        for (const row of stationSubs) {
          // One subscription that cannot be sent to (bad key, push service down) must
          // not stop the alerts for everyone else at this station.
          try {
            summary.sent += await this.checkSwings(row, events, nowDate)
            summary.sent += await this.checkSurge(row, reading)
          } catch (e) {
            summary.errors++
            this.log(`station ${stationId} subscription ${String(row.id).slice(0, 8)}: ${e.message}`)
          }
        }
      } catch (e) {
        summary.errors++
        this.log(`station ${stationId}: ${e.message}`)
      }
    }
    this.sql.exec('DELETE FROM sent WHERE at < ?', now - 14 * 24 * 3600e3)
    return summary
  }

  async checkSwings(row, events, now) {
    const settings = JSON.parse(row.settings)
    const { alerts } = findAlerts(events, now, settings)
    let sent = 0
    for (const a of alerts.filter((x) => x.from.time - now < SWING_LEAD_MS)) {
      const key = `swing:${row.station_id}:${a.from.time.toISOString()}`
      if (rows(this.sql.exec('SELECT 1 FROM sent WHERE sub_id = ? AND key = ?', row.id, key)).length) continue
      const ok = await this.push(row, {
        title: `Large tidal range at ${row.station_name}`,
        body: `${a.rising ? 'Rise' : 'Fall'} of ${a.size.toFixed(1)} ft: ${a.rising ? 'LW' : 'HW'} ${formatStationTime(a.from.local, { withDay: false })} to ${a.rising ? 'HW' : 'LW'} ${formatStationTime(a.to.local, { withDay: false })}.`,
        tag: `${row.station_id}:${a.from.time.toISOString()}`, // same tag as the app, so no duplicates
        url: this.stationUrl(row.station_id),
      })
      if (ok) {
        this.sql.exec('INSERT OR REPLACE INTO sent (sub_id, key, at) VALUES (?, ?, ?)', row.id, key, now.getTime())
        sent++
      }
    }
    return sent
  }

  // Same rule as the app: notify once when the gauge crosses the level; the episode
  // ends when the water eases below 75% of the level or flips direction.
  async checkSurge(row, reading) {
    const { surgeFeet } = JSON.parse(row.settings)
    if (surgeFeet == null || reading?.diff == null || reading.ageMs > MAX_READING_AGE_MS) return 0
    const dir = reading.diff > 0 ? 'above' : 'below'
    const active = rows(this.sql.exec('SELECT dir FROM surge WHERE sub_id = ?', row.id))[0]
    if (active && (Math.abs(reading.diff) < surgeFeet * 0.75 || active.dir !== dir)) {
      this.sql.exec('DELETE FROM surge WHERE sub_id = ?', row.id)
    } else if (active) {
      return 0
    }
    if (Math.abs(reading.diff) < surgeFeet) return 0
    const ok = await this.push(row, {
      title: `Water ${diffText(reading.diff)} at ${row.station_name}`,
      body: `The tide gauge reads ${Math.abs(reading.diff).toFixed(1)} ft ${dir} prediction: ${dir === 'above' ? 'wind set-up or storm surge' : 'offshore wind blowing the water out'}.`,
      tag: `${row.station_id}:surge`,
      url: `${this.stationUrl(row.station_id)}&mode=live`,
    })
    if (!ok) return 0
    this.sql.exec('INSERT OR REPLACE INTO surge (sub_id, dir, at) VALUES (?, ?, ?)', row.id, dir, Date.now())
    return 1
  }

  stats() {
    return {
      subscriptions: rows(this.sql.exec('SELECT COUNT(*) AS n FROM subs'))[0].n,
      stations: rows(this.sql.exec('SELECT COUNT(DISTINCT station_id) AS n FROM subs'))[0].n,
      lastRun: this.getKV('lastRun'),
    }
  }
}
