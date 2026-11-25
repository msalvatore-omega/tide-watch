// End-to-end tests of the alerts engine with real NOAA data (Baltimore, saved in
// fixtures/) and a fake push service that decrypts each message like a phone would.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import ece from 'http_ece'
import { Engine } from '../src/engine.js'
import { b64u } from '../src/webpush.js'
import { memorySql } from './sqlite-adapter.js'
import { findAlerts } from '../../src/alerts.js'
import { fetchHiLo } from '../../src/noaa.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url)))
const STATION = '8574680'
const latestReading = new Date(fixture('water_level').data.at(-1).t.replace(' ', 'T') + ':00Z')
const NOW = latestReading.getTime() + 5 * 60e3

const surges = () => delivered.filter((d) => d.tag.endsWith(':surge'))

let surgeOffset = 0 // feet added to every gauge reading, to simulate wind/storm surge
let pushStatus = 201 // what the fake push service answers
let delivered = [] // decrypted messages, per device
let noaaCalls = 0

function makeDevice(name) {
  const ua = crypto.createECDH('prime256v1')
  ua.generateKeys()
  const auth = crypto.randomBytes(16)
  return {
    name, ua, auth,
    subscription: { endpoint: `https://push.example.com/${name}`, keys: { p256dh: b64u.encode(ua.getPublicKey()), auth: b64u.encode(auth) } },
  }
}
const devices = {}

globalThis.fetch = async (url, init) => {
  const u = new URL(url)
  if (u.hostname === 'push.example.com') {
    const device = devices[u.pathname.slice(1)]
    assert.match(init.headers.Authorization, /^vapid t=.+, k=.+$/)
    assert.equal(init.headers['Content-Encoding'], 'aes128gcm')
    const plain = ece.decrypt(Buffer.from(init.body), { version: 'aes128gcm', privateKey: device.ua, authSecret: device.auth })
    if (pushStatus < 300) delivered.push({ device: device.name, ...JSON.parse(plain) })
    return new Response(null, { status: pushStatus })
  }
  noaaCalls++
  const p = u.searchParams
  if (p.get('station') !== STATION) return Response.json({ error: { message: 'No data was found.' } }, { status: 400 })
  if (p.get('interval') === 'hilo') return Response.json(fixture(`hilo-${p.get('time_zone')}`))
  if (p.get('product') === 'predictions') return Response.json(fixture('predictions-6min'))
  if (p.get('product') === 'water_level') {
    const wl = fixture('water_level')
    wl.data.forEach((d) => { d.v = (Number(d.v) + surgeOffset).toFixed(3) })
    return Response.json(wl)
  }
  throw new Error(`unexpected fetch ${url}`)
}

let engine
beforeEach(() => {
  engine = new Engine(memorySql(), { subject: 'https://example.com/', siteUrl: 'https://example.com/tidely/' })
  surgeOffset = 0
  pushStatus = 201
  delivered = []
  noaaCalls = 0
  for (const n of ['phone', 'tablet']) devices[n] = makeDevice(n)
})

const subscribe = (device, settings, stationId = STATION) =>
  engine.subscribe({ subscription: device.subscription, stationId, stationName: 'Baltimore', settings }, NOW)

test('VAPID keys are created once and reused', async () => {
  const a = await engine.vapid()
  const b = await engine.vapid()
  assert.equal(a.publicKey, b.publicKey)
})

test('surge: notifies once when the gauge is off the forecast, not again while it stays high', async () => {
  surgeOffset = 1.5
  await subscribe(devices.phone, { mode: 'auto', surgeFeet: 1 })
  await engine.check(NOW)
  assert.equal(surges().length, 1)
  assert.match(surges()[0].title, /^🌬️ Water \d\.\d ft above predicted at Baltimore$/)
  assert.equal(surges()[0].url, `https://example.com/tidely/?station=${STATION}&mode=live`)
  assert.equal((await engine.check(NOW + 5 * 60e3)).sent, 0, 'no repeat during the same surge')
  assert.equal(surges().length, 1)
})

test('surge: episode ends when the water eases back, and a new surge notifies again', async () => {
  surgeOffset = 1.5
  await subscribe(devices.phone, { surgeFeet: 1 })
  await engine.check(NOW)
  surgeOffset = 0 // back to normal (real readings are ~0.3 ft off)
  await engine.check(NOW)
  assert.equal(surges().length, 1)
  surgeOffset = 1.5
  await engine.check(NOW)
  assert.equal(surges().length, 2)
})

test('surge: respects each device\'s own level, and "off"', async () => {
  surgeOffset = 0.8 // real offset ~0.3 + 0.8 ≈ 1.1 ft
  await subscribe(devices.phone, { surgeFeet: 1 })
  await subscribe(devices.tablet, { surgeFeet: 2 })
  await engine.check(NOW)
  assert.deepEqual(surges().map((d) => d.device), ['phone'])
  await subscribe(devices.phone, { surgeFeet: null })
  surgeOffset = 3
  await engine.check(NOW)
  assert.deepEqual(surges().map((d) => d.device), ['phone', 'tablet'], 'phone has surge warnings off')
})

test('swings: notifies ~3 hours before each big swing, once', async () => {
  const events = await fetchHiLo(STATION)
  const { alerts } = findAlerts(events, new Date(NOW), { mode: 'auto' })
  const upcoming = alerts.find((a) => a.from.time > NOW)
  const before = upcoming.from.time.getTime() - 2 * 3600e3 // 2 hours ahead of it
  await subscribe(devices.phone, { mode: 'auto', surgeFeet: null })
  const run = await engine.check(before)
  assert.ok(run.sent >= 1)
  const msg = delivered.find((d) => d.tag === `${STATION}:${upcoming.from.time.toISOString()}`)
  assert.ok(msg, 'swing notification uses the same tag as the app')
  assert.match(msg.title, /^🌊 Large tidal range at Baltimore$/)
  assert.match(msg.body, /^(Rise|Fall) of \d+\.\d ft: (LW|HW) \d{1,2}:\d{2} [AP]M to (HW|LW) \d{1,2}:\d{2} [AP]M\.$/)
  const count = delivered.length
  await engine.check(before + 5 * 60e3)
  assert.equal(delivered.length, count, 'no repeat')
})

test('expired subscriptions (410 Gone) are removed', async () => {
  surgeOffset = 1.5
  await subscribe(devices.phone, { surgeFeet: 1 })
  pushStatus = 410
  await engine.check(NOW)
  assert.equal(engine.stats().subscriptions, 0)
})

test('stations without a gauge still get swing checks; predictions are cached', async () => {
  await subscribe(devices.phone, { surgeFeet: 1 })
  await engine.check(NOW)
  const callsAfterFirst = noaaCalls
  await engine.check(NOW + 5 * 60e3)
  assert.equal(noaaCalls - callsAfterFirst, 2, 'second run only re-reads the live gauge (2 calls), not 31 days of predictions')
  await subscribe(devices.tablet, { surgeFeet: 1 }, 'NOGAUGE1')
  const run = await engine.check(NOW + 10 * 60e3)
  assert.equal(run.errors, 1, 'unknown station is reported, not fatal')
})

test('rejects bad input', async () => {
  await assert.rejects(engine.subscribe({ subscription: { endpoint: 'http://evil.example/x', keys: {} }, stationId: STATION }), /Invalid push subscription/)
  await assert.rejects(engine.subscribe({ subscription: devices.phone.subscription, stationId: '../etc' }), /Invalid station/)
  const junkKeys = { endpoint: 'https://push.example.com/x', keys: { p256dh: 'BPx', auth: 'AAA' } }
  await assert.rejects(engine.subscribe({ subscription: junkKeys, stationId: STATION }), /Invalid push subscription/)
})

test('test notification, rate limited to once a minute', async () => {
  await subscribe(devices.phone, {})
  await engine.test(devices.phone.subscription.endpoint, NOW)
  assert.equal(delivered[0].title, '🌊 Tidely alerts are on')
  await assert.rejects(engine.test(devices.phone.subscription.endpoint, NOW + 10e3), /wait a minute/)
  await engine.unsubscribe(devices.phone.subscription.endpoint)
  await assert.rejects(engine.test(devices.phone.subscription.endpoint, NOW + 120e3), /not subscribed/)
})
