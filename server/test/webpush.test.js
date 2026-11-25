// Checks our WebCrypto Web Push against independent implementations:
// the encrypted body is decrypted with the `http_ece` library, and the VAPID
// signature is verified with Node's crypto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import ece from 'http_ece'
import { encryptPayload, vapidAuthorization, generateVapidKeys, b64u } from '../src/webpush.js'

function fakeBrowser() {
  const ua = crypto.createECDH('prime256v1')
  ua.generateKeys()
  const auth = crypto.randomBytes(16)
  return { ua, auth, subscription: { endpoint: 'https://push.example.com/abc', keys: { p256dh: b64u.encode(ua.getPublicKey()), auth: b64u.encode(auth) } } }
}

test('payload decrypts with an independent aes128gcm implementation', async () => {
  const { ua, auth, subscription } = fakeBrowser()
  const message = JSON.stringify({ title: '🌊 Big tide swing at Baltimore', body: 'Water rises 2.0 ft' })
  const body = await encryptPayload(subscription, new TextEncoder().encode(message))
  const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: auth })
  assert.equal(plain.toString('utf8'), message)
})

test('VAPID JWT is a valid ES256 signature for the push service origin', async () => {
  const vapid = await generateVapidKeys()
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/xyz', vapid, 'https://example.com/')
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)
  assert.equal(k, vapid.publicKey)
  const [h, c, sig] = jwt.split('.')
  const claims = JSON.parse(Buffer.from(b64u.decode(c)).toString())
  assert.equal(claims.aud, 'https://fcm.googleapis.com')
  assert.equal(claims.sub, 'https://example.com/')
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600)
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: vapid.privateJwk.x, y: vapid.privateJwk.y }, format: 'jwk' })
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64u.decode(sig))))
  assert.equal(b64u.decode(vapid.publicKey).length, 65)
})
