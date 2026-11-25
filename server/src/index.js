// Tidely alerts server (Cloudflare Worker).
//   GET  /vapid        → { publicKey } for the browser's push subscription
//   POST /subscribe    → { subscription, stationId, stationName, settings }
//   POST /unsubscribe  → { endpoint }
//   POST /test         → { endpoint }  sends a test notification
//   GET  /health       → counts and last scheduled run
//   GET  /ai/status    → { enabled }
//   POST /ai/briefing  → { stationId }            short AI briefing (cached 30 min per station)
//   POST /ai/ask       → { stationId, question }  AI answer from the station's data
// A cron trigger (every 5 minutes) runs the checks.

import { DurableObject } from 'cloudflare:workers'
import { Engine } from './engine.js'

/** All state lives in one SQLite-backed Durable Object. */
export class AlertStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.engine = new Engine(ctx.storage.sql, {
      subject: env.VAPID_SUBJECT,
      siteUrl: env.SITE_URL,
      log: (m) => console.log(m),
      ai: {
        apiKey: env.ANTHROPIC_API_KEY, // secret; AI endpoints are off until it is set
        model: env.AI_MODEL || 'claude-opus-5-5',
        dailyLimit: Number(env.AI_DAILY_LIMIT) || 300,
        perVisitorLimit: Number(env.AI_PER_VISITOR_DAILY) || 25,
      },
    })
  }
  async vapidPublicKey() { return (await this.engine.vapid()).publicKey }
  subscribe(body) { return this.engine.subscribe(body) }
  unsubscribe(endpoint) { return this.engine.unsubscribe(endpoint) }
  test(endpoint) { return this.engine.test(endpoint) }
  stats() { return this.engine.stats() }
  aiStatus() { return { enabled: this.engine.aiEnabled() } }
  // Errors are returned as values: custom error classes don't survive the Durable Object boundary.
  async ai(kind, body, who) {
    try {
      return kind === 'ask' ? await this.engine.aiAsk(body.stationId, body.question, who) : await this.engine.aiBriefing(body.stationId, who)
    } catch (e) {
      console.log(`ai error: ${e.message}`)
      return { error: e.status ? e.message : 'Something went wrong preparing the answer.', status: e.status ?? 500 }
    }
  }
  async check() {
    const summary = await this.engine.check()
    this.engine.setKV('lastRun', { at: new Date().toISOString(), ...summary })
    return summary
  }
}

const store = (env) => env.STORE.get(env.STORE.idFromName('main'))

function cors(request, env) {
  const origin = request.headers.get('Origin')
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim())
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export default {
  async fetch(request, env) {
    const headers = { ...cors(request, env), 'Content-Type': 'application/json' }
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

    const { pathname } = new URL(request.url)
    try {
      if (request.method === 'GET' && pathname === '/vapid') return json({ publicKey: await store(env).vapidPublicKey() })
      if (request.method === 'GET' && pathname === '/health') return json(await store(env).stats())
      if (request.method === 'GET' && pathname === '/ai/status') return json(await store(env).aiStatus())
      if (request.method === 'POST') {
        if (Number(request.headers.get('Content-Length') ?? 0) > 8192) return json({ error: 'Too large.' }, 413)
        const body = await request.json().catch(() => ({}))
        if (pathname === '/subscribe') return json(await store(env).subscribe(body))
        if (pathname === '/unsubscribe') { await store(env).unsubscribe(body.endpoint); return json({ ok: true }) }
        if (pathname === '/test') return json(await store(env).test(body.endpoint))
        if (pathname === '/ai/briefing' || pathname === '/ai/ask') {
          const who = request.headers.get('CF-Connecting-IP') ?? 'unknown'
          const out = await store(env).ai(pathname === '/ai/ask' ? 'ask' : 'briefing', body, who)
          return out.error ? json({ error: out.error }, out.status) : json(out)
        }
      }
      return json({ error: 'Not found.' }, 404)
    } catch (e) {
      return json({ error: e.message }, 400)
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(store(env).check().then((s) => console.log('check', JSON.stringify(s))))
  },
}
