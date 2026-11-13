// Web Push without a library: the message encrypted for the phone it goes to (RFC 8291, "aes128gcm") and signed by
// this server (VAPID, RFC 8292), with nothing but the platform's WebCrypto, so the same code runs in the server
// function (Deno) and in the tests (Node: scripts/push/webpush.test.mjs checks it against the RFC's own example).

const enc = new TextEncoder();

export const b64u = {
  encode(b: Uint8Array): string {
    let s = "";
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array {
    const t = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(t + "===".slice((t.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** HKDF-SHA-256: extract with the salt, expand with the info, `length` bytes */
export async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** The server's identity for the push services: the public half goes to the browsers, the private half signs. */
export interface VapidKeys { publicKey: string; privateJwk: JsonWebKey }

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: b64u.encode(raw), privateJwk: jwk };
}

/** "vapid t=<signed token>, k=<public key>": who sends, for which push service, valid 12 hours */
export async function vapidAuth(endpoint: string, keys: VapidKeys, subject: string): Promise<string> {
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const { key_ops: _ops, ext: _ext, ...jwk } = keys.privateJwk;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // (WebCrypto signs as r‖s, 64 bytes: the form a JSON web token wants)
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64u.encode(sig)}, k=${keys.publicKey}`;
}

/**
 * The message, readable only by the browser that subscribed (its public key `p256dh` and secret `auth`): a one-off
 * key pair on this side, the shared secret, then AES-128-GCM in a single record. `fixed` is for the tests (the
 * RFC's example uses a known key pair and salt).
 */
export async function encrypt(
  payload: Uint8Array,
  sub: { p256dh: string; auth: string },
  fixed?: { keys: CryptoKeyPair; salt: Uint8Array },
): Promise<Uint8Array> {
  const uaPublic = b64u.decode(sub.p256dh);
  const authSecret = b64u.decode(sub.auth);
  const asKeys = fixed?.keys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // the last (and only) record ends with the delimiter 2
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

export interface PushSubscriptionRow { endpoint: string; p256dh: string; auth: string }

/** Sends one notification; `gone` when the phone has unsubscribed (the row can go). */
export async function sendPush(
  sub: PushSubscriptionRow,
  message: unknown,
  keys: VapidKeys,
  opts: { subject: string; ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string },
): Promise<{ status: number; gone: boolean }> {
  const body = await encrypt(enc.encode(JSON.stringify(message)), sub);
  const headers: Record<string, string> = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(opts.ttl ?? 2 * 86400),
    Urgency: opts.urgency ?? "normal",
    Authorization: await vapidAuth(sub.endpoint, keys, opts.subject),
  };
  // (a phone that was off gets only the latest of the messages with the same topic)
  if (opts.topic) headers.Topic = opts.topic;
  const res = await fetch(sub.endpoint, { method: "POST", headers, body });
  await res.body?.cancel();
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
