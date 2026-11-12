// Checks the Web Push encryption of the "push" server function (supabase/functions/_shared/webpush.ts) against the
// worked example of RFC 8291 (appendix A), decrypts a fresh message as the browser would, and checks the VAPID
// signature. Run: node scripts/push/webpush.test.mjs   (Node 22: TypeScript files load with --experimental-strip-types)
import assert from "node:assert/strict";
import { b64u, concat, encrypt, generateVapidKeys, hkdf, vapidAuth } from "../../supabase/functions/_shared/webpush.ts";

const enc = new TextEncoder();
const subtle = crypto.subtle;
const pubToJwk = (raw, d) => ({ kty: "EC", crv: "P-256", x: b64u.encode(raw.slice(1, 33)), y: b64u.encode(raw.slice(33, 65)), ...(d ? { d } : {}) });

// ---- RFC 8291, appendix A
const V = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
const asRaw = b64u.decode(V.asPublic);
const keys = {
  privateKey: await subtle.importKey("jwk", pubToJwk(asRaw, V.asPrivate), { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
  publicKey: await subtle.importKey("raw", asRaw, { name: "ECDH", namedCurve: "P-256" }, true, []),
};
const body = await encrypt(enc.encode(V.plaintext), { p256dh: V.uaPublic, auth: V.auth }, { keys, salt: b64u.decode(V.salt) });
assert.equal(b64u.encode(body), V.body, "RFC 8291 example");
console.log("ok  RFC 8291 example, byte for byte");

// ---- a fresh message, decrypted the way the browser does
async function decrypt(body, uaPrivateKey, uaPublicRaw, authSecret) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), sealed = body.slice(21 + idlen);
  const asKey = await subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: asKey }, uaPrivateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublicRaw, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const k = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, sealed));
  assert.equal(plain[plain.length - 1], 2, "last record delimiter");
  return new TextDecoder().decode(plain.slice(0, -1));
}
const ua = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const uaRaw = new Uint8Array(await subtle.exportKey("raw", ua.publicKey));
const secret = crypto.getRandomValues(new Uint8Array(16));
const msg = JSON.stringify({ title: "Jour 12 : St Arnaud", body: "23,4 km et 1 210 m de montée.", url: "https://example.org/#/jour/12" });
const fresh = await encrypt(enc.encode(msg), { p256dh: b64u.encode(uaRaw), auth: b64u.encode(secret) });
assert.equal(await decrypt(fresh, ua.privateKey, uaRaw, secret), msg);
console.log("ok  a fresh message decrypts as the browser would");

// ---- the VAPID header: a valid ES256 token for the push service's origin, and the public key
const vk = await generateVapidKeys();
const roundTrip = JSON.parse(JSON.stringify(vk)); // (as stored in the database)
const header = await vapidAuth("https://web.push.apple.com/QGuQyavXutnMH...", roundTrip, "https://example.org/");
const [, t, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
assert.equal(k, vk.publicKey);
const [h, c, s] = t.split(".");
const claims = JSON.parse(new TextDecoder().decode(b64u.decode(c)));
assert.equal(claims.aud, "https://web.push.apple.com");
assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
const pub = await subtle.importKey("raw", b64u.decode(vk.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
assert.ok(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64u.decode(s), enc.encode(`${h}.${c}`)), "signature");
assert.equal(b64u.decode(vk.publicKey).length, 65);
console.log("ok  VAPID token signed and verifiable, public key 65 bytes");
