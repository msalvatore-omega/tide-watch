// AI briefing / ask: context building, caching, limits and error handling, with a
// fake Claude client (no real API calls) and saved Baltimore NOAA data.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Engine } from '../src/engine.js'
import { buildContext, generate, AiError } from '../src/ai.js'
import { fetchHiLo } from '../../src/noaa.js'
import { memorySql } from './sqlite-adapter.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url)))
const STATION = '8574680'
const NOW = new Date(fixture('water_level').data.at(-1).t.replace(' ', 'T') + ':00Z').getTime() + 5 * 60e3

globalThis.fetch = async (url) => {
  const u = new URL(url)
  const p = u.searchParams
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
  if (u.pathname.endsWith(`/stations/${STATION}.json`)) return json({ stations: [{ id: STATION, name: 'Baltimore', state: 'MD', lat: 39.2667, lng: -76.5783 }] })
  if (u.pathname.endsWith('/datums.json')) return json({ datums: [{ name: 'MLLW', value: 4.11 }, { name: 'MSL', value: 4.9 }] })
  if (u.pathname.endsWith('/floodlevels.json')) return json({ nos_minor: 7.47, nos_moderate: 8.44, nos_major: 9.67 })
  if (p.get('interval') === 'hilo') return json(fixture(`hilo-${p.get('time_zone')}`))
  if (p.get('product') === 'predictions') return json(fixture('predictions-6min'))
  if (p.get('product') === 'water_level') return json(fixture('water_level'))
  if (p.get('product') === 'wind') return json({ data: [{ t: '2026-11-25 20:24', s: '8.16', d: '57.0', dr: 'ENE', g: '12.05' }] })
  if (p.get('product') === 'water_temperature') return json({ data: [{ t: '2026-11-25 20:24', v: '63.5' }] })
  return json({ error: { message: 'No data was found.' } }, 400)
}

/** Stand-in for the Anthropic client: records requests, returns a canned reply. */
function fakeClaude(reply = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'High at 19:06, 1.8 ft.' }], model: 'claude-opus-5-5', usage: { input_tokens: 900, output_tokens: 60 } }) {
  const calls = []
  const create = async (params) => { calls.push(params); if (reply instanceof Error) throw reply; return reply }
  return { calls, beta: { messages: { create } }, messages: { create } }
}

let engine, claude
beforeEach(() => {
  claude = fakeClaude()
  engine = new Engine(memorySql(), { subject: 'https://example.com/', siteUrl: 'https://example.com/', ai: { client: claude, perVisitorLimit: 3, dailyLimit: 5 } })
})

test('context contains the facts the model is allowed to use, in station-local time', async () => {
  const context = await buildContext(STATION, await fetchHiLo(STATION), NOW)
  assert.match(context, /^<station_data>\nStation: Baltimore, MD \(NOAA 8574680\)/)
  assert.match(context, /Local date and time now: 2026-11-25 15:\d\d/)
  assert.match(context, /Gauge reading \(5 min ago\): \d\.\d ft, (rising|falling|steady); \d\.\d ft above predicted/)
  assert.match(context, /Wed 19:06 11-25 {2}High 1\.8 ft\n/)
  assert.match(context, /Wed 12:03 11-25 {2}Low -0\.2 ft \(already passed\)/)
  assert.match(context, /Flooding starts at: minor 3\.4 ft, moderate 4\.3 ft, major 5\.6 ft\./)
  assert.match(context, /Weather at the gauge now: wind ENE 9 mph \(8 kt\), gusts 14 mph; water 64°F\./)
  assert.match(context, /Sun 2026-11-25: rises 0?7:00, sets 16:46\./)
  assert.match(context, /Moon: Full moon \(spring tides/)
  assert.match(context, /Unusually large swings[\s\S]*under way now/)
  assert.ok(context.length < 6000, `context should stay compact (was ${context.length} chars)`)
})

test('briefing: one Claude call, then shared from cache for 30 minutes', async () => {
  const first = await engine.aiBriefing(STATION, 'visitor-a', NOW)
  assert.equal(first.text, 'High at 19:06, 1.8 ft.')
  assert.equal(first.cached, false)
  const again = await engine.aiBriefing(STATION, 'visitor-b', NOW + 10 * 60e3)
  assert.equal(again.cached, true)
  assert.equal(claude.calls.length, 1)
  await engine.aiBriefing(STATION, 'visitor-b', NOW + 31 * 60e3)
  assert.equal(claude.calls.length, 2)
})

test('request shape: Opus 5.5 with low effort, refusal fallback on, no thinking/sampling params, question fenced off', async () => {
  await engine.aiAsk(STATION, '  When is the next\n low tide?  ', 'v', NOW)
  const req = claude.calls[0]
  assert.equal(req.model, 'claude-opus-5-5')
  assert.deepEqual(req.output_config, { effort: 'low' })
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01'])
  assert.equal(req.fallbacks, 'default')
  for (const banned of ['thinking', 'temperature', 'top_p', 'tool_choice']) assert.ok(!(banned in req), `${banned} must not be sent`)
  assert.match(req.messages[0].content, /<question>\nWhen is the next low tide\?\n<\/question>$/)
  assert.match(req.messages[0].content, /^<station_data>/)
  assert.match(req.system, /Work only from that data/)
})

test('models without server-side refusal fallback skip that parameter', async () => {
  const c = fakeClaude()
  await generate({ model: 'claude-haiku-5-5', context: '<station_data>x</station_data>', client: c })
  assert.ok(!('fallbacks' in c.calls[0]) && !('betas' in c.calls[0]))
})

test('limits: per visitor and overall per day; cached briefings are free', async () => {
  for (let i = 0; i < 3; i++) await engine.aiAsk(STATION, `question ${i}?`, 'visitor-a', NOW)
  await assert.rejects(engine.aiAsk(STATION, 'one more?', 'visitor-a', NOW), (e) => e instanceof AiError && e.status === 429 && /You've reached today's limit/.test(e.message))
  await engine.aiAsk(STATION, 'another visitor?', 'visitor-b', NOW)
  await engine.aiBriefing(STATION, 'visitor-b', NOW) // 5th call today
  await engine.aiBriefing(STATION, 'visitor-c', NOW) // cached: allowed
  await assert.rejects(engine.aiAsk(STATION, 'over the daily cap?', 'visitor-c', NOW), /Today's AI limit/)
  await engine.aiAsk(STATION, 'next day works again?', 'visitor-a', NOW + 24 * 3600e3)
})

test('bad input and missing key are rejected before any Claude call', async () => {
  await assert.rejects(engine.aiAsk(STATION, 'hi', 'v', NOW), /Type a question/)
  await assert.rejects(engine.aiAsk(STATION, 'x'.repeat(301), 'v', NOW), /under 300 characters/)
  await assert.rejects(engine.aiAsk('../etc', 'When is high tide?', 'v', NOW), /Invalid station/)
  assert.equal(claude.calls.length, 0)
  const off = new Engine(memorySql(), { subject: 's', siteUrl: 's' })
  assert.equal(off.aiEnabled(), false)
  await assert.rejects(off.aiBriefing(STATION, 'v', NOW), (e) => e.status === 503)
})

test('refusals and empty replies become clear errors, and are not cached', async () => {
  const refused = new Engine(memorySql(), { subject: 's', siteUrl: 's', ai: { client: fakeClaude({ stop_reason: 'refusal', content: [], stop_details: { category: null } }) } })
  await assert.rejects(refused.aiBriefing(STATION, 'v', NOW), (e) => e.status === 422)
  assert.equal(refused.getKV(`briefing:${STATION}`), null)
  const empty = new Engine(memorySql(), { subject: 's', siteUrl: 's', ai: { client: fakeClaude({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] }) } })
  await assert.rejects(empty.aiBriefing(STATION, 'v', NOW), /no answer/)
})
