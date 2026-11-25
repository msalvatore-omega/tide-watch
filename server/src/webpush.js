// Web Push for Cloudflare Workers using only WebCrypto (no Node libraries).
//   VAPID authentication: RFC 8292 (ES256-signed JWT)
//   Payload encryption:   RFC 8291 + RFC 8188 ("aes128gcm" content encoding)

const enc = new TextEncoder()

export const b64u = {
  encode(bytes) {
    const b = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
    let s = ''
    for (const x of b) s += String.fromCharCode(x)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4))
    return Uint8Array.from(s, (c) => c.charCodeAt(0))
  },
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}

/** New VAPID key pair. The private key never leaves the server's storage. */
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return {
    publicKey: b64u.encode(await crypto.subtle.exportKey('raw', kp.publicKey)), // 65-byte uncompressed point
    privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
  }
}

/** "Authorization: vapid t=<jwt>, k=<public key>" for one push service origin. */
export async function vapidAuthorization(endpoint, vapid, subject) {
  const header = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u.encode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })))
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // WebCrypto returns the raw r||s signature, which is exactly what JWS ES256 wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`))
  return `vapid t=${header}.${claims}.${b64u.encode(sig)}, k=${vapid.publicKey}`
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/** Encrypt a payload for one browser subscription (single aes128gcm record). */
export async function encryptPayload(subscription, plaintext) {
  const uaPublic = b64u.decode(subscription.keys.p256dh)
  const authSecret = b64u.decode(subscription.keys.auth)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // Fresh ephemeral key pair per message.
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const record = concat(plaintext, new Uint8Array([2])) // 0x02 = final-record delimiter
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))

  // Header: salt(16) | record size(4) | key id length(1) | key id = our public key(65)
  const header = new Uint8Array(21 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, ciphertext)
}

/**
 * Send one notification. Returns the push service's HTTP status:
 * 201 = accepted; 404/410 = subscription is gone and should be deleted.
 */
export async function sendPush(subscription, message, { vapid, subject, ttl = 3 * 3600, urgency = 'high' }) {
  const body = await encryptPayload(subscription, enc.encode(JSON.stringify(message)))
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  })
  return res.status
}
