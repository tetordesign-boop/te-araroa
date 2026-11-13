// Runs the "push" server function (supabase/functions/push, with its shared helpers) in Node against a pretend
// database and a pretend push service that decrypts what it receives the way a phone does, to check the whole path:
// the key for the site, the welcome notification, and which days are announced (never before the start date, never
// twice, one notification for several days), in each phone's language.
// Run: node --experimental-strip-types --no-warnings scripts/push/function.test.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../supabase/functions/", import.meta.url).pathname;
const read = (f) => readFileSync(root + f, "utf8");
const src = [read("_shared/util.ts"), read("_shared/webpush.ts"), read("push/index.ts").replace(/^import .* from "\.\.\/_shared\/[^"]+";\n/gm, "")]
  .join("\n").replace(/^import \{ createClient, type SupabaseClient \} from "npm:@supabase\/supabase-js@[^"]+";$/m, "const createClient = (globalThis as any).__createClient; type SupabaseClient = any;");
const dir = mkdtempSync(join(tmpdir(), "pushfn-"));
writeFileSync(join(dir, "push.ts"), src);
const { b64u, concat, hkdf } = await import(new URL("../../supabase/functions/_shared/webpush.ts", import.meta.url).href);

// ---------------------------------------------------------------- a pretend database
const db = {
  settings: [{ id: 1, start_date: null }],
  days: [],
  push_sent: [],
  push_subs: [],
  admins: [{ user_id: "u1" }],
};
const secrets = new Map();
function table(name) {
  let rows = db[name], filters = [], op = "select", payload = null, single = false, range = null;
  const q = {
    select() { return q; }, order() { return q; },
    eq(c, v) { filters.push((r) => r[c] === v); return q; },
    in(c, v) { filters.push((r) => v.includes(r[c])); return q; },
    gte(c, v) { filters.push((r) => r[c] >= v); return q; },
    range(a, b) { range = [a, b]; return q; },
    maybeSingle() { single = true; return q; },
    insert(v) { op = "insert"; payload = v; return q; },
    update(v) { op = "update"; payload = v; return q; },
    delete() { op = "delete"; return q; },
    then(res, rej) {
      try {
        const match = (r) => filters.every((f) => f(r));
        if (op === "insert") {
          const list = Array.isArray(payload) ? payload : [payload];
          if (name === "push_sent" && list.some((x) => db.push_sent.some((y) => y.day_id === x.day_id))) return res({ data: null, error: { message: "duplicate key" } });
          db[name].push(...list.map((x) => ({ phones: 0, ...x })));
          return res({ data: null, error: null });
        }
        if (op === "update") { for (const r of rows.filter(match)) Object.assign(r, payload); return res({ data: null, error: null }); }
        if (op === "delete") { db[name] = rows.filter((r) => !match(r)); return res({ data: null, error: null }); }
        let out = rows.filter(match).map((r) => ({ ...r }));
        if (name === "days") out.sort((a, b) => a.date.localeCompare(b.date));
        if (range) out = out.slice(range[0], range[1] + 1);
        return res({ data: single ? out[0] ?? null : out, error: null });
      } catch (e) { rej(e); }
    },
  };
  return q;
}
globalThis.__createClient = () => ({
  from: table,
  rpc: async (fn, a) => {
    if (fn === "svc_get_secret") return { data: secrets.get(a.p_key) ?? null, error: null };
    if (fn === "svc_init_secret") { if (!secrets.has(a.p_key)) secrets.set(a.p_key, a.p_value); return { data: secrets.get(a.p_key), error: null }; }
    return { data: null, error: { message: `no rpc ${fn}` } };
  },
  auth: { getUser: async (t) => (t === "a.admin.jwt" ? { data: { user: { id: "u1" } }, error: null } : { data: null, error: { message: "bad" } }) },
});
let handler;
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => ({ SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "service" })[k] } };
await import(join(dir, "push.ts"));
const call = (method, body, token) => handler(new Request("http://fn/push", { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }));

// ---------------------------------------------------------------- a pretend push service: two phones
const phones = [];
const received = [];
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = new Uint8Array(Buffer.concat(chunks));
  const phone = phones.find((p) => req.url === p.path);
  if (!phone) { res.writeHead(410).end(); return; }
  // the VAPID signature, with the key the site was given
  const [, t, k] = req.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  const [h, c, s] = t.split(".");
  const pub = await crypto.subtle.importKey("raw", b64u.decode(k), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64u.decode(s), new TextEncoder().encode(`${h}.${c}`)), "VAPID signature");
  assert.equal(req.headers["content-encoding"], "aes128gcm");
  // decrypt as the phone would
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), sealed = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, phone.keys.privateKey, 256));
  const enc = new TextEncoder();
  const ikm = await hkdf(phone.auth, shared, concat(enc.encode("WebPush: info\0"), phone.raw, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed));
  received.push({ phone: phone.name, ...JSON.parse(new TextDecoder().decode(plain.slice(0, -1))) });
  res.writeHead(201).end();
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
for (const [name, lang] of [["maman", "fr"], ["kiwi", "en"]]) {
  const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  phones.push({ name, path: `/${name}`, keys, raw, auth });
  db.push_subs.push({ endpoint: `${base}/${name}`, p256dh: b64u.encode(raw), auth: b64u.encode(auth), lang, fails: 0, hello_at: null });
}
db.push_subs.push({ endpoint: `${base}/gone`, p256dh: db.push_subs[0].p256dh, auth: db.push_subs[0].auth, lang: "fr", fails: 0, hello_at: null });

// ---------------------------------------------------------------- the checks
const r0 = await (await call("GET")).json();
assert.equal(b64u.decode(r0.key).length, 65);
const r0b = await (await call("GET")).json();
assert.equal(r0b.key, r0.key, "the same key every time");
console.log("ok  the site's key, made once and kept");

let r = await (await call("POST", { action: "hello", endpoint: `${base}/maman` })).json();
assert.equal(r.ok, true);
assert.equal(received.at(-1).body, "C'est réglé : vous serez prévenu à chaque nouvelle étape.");
r = await (await call("POST", { action: "hello", endpoint: `${base}/maman` })).json();
assert.equal(r.skipped, true, "once an hour");
console.log("ok  the welcome notification, once");

const dayIso = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const day = (n, date, extra = {}) => ({ id: `00000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`, day_number: n, date, kind: "hike", title: null, title_en: null, start_name: null, end_name: "St Arnaud", distance_km: 23.4, ascent_m: 1210, voice: null, published: true, ...extra });
db.days.push(day(1, dayIso(-1)), day(2, dayIso(0), { title: "La crête de la Richmond Range", title_en: "Along the Richmond Range", voice: { path: "x", s: 40 } }));

const before = received.length;
assert.equal((await call("POST", { action: "notify", days: [db.days[1].id] })).status, 401, "only from the Carnet");
r = await (await call("POST", { action: "notify", days: [db.days[1].id] }, "a.admin.jwt")).json();
assert.equal(r.note, "no start date");
assert.equal(received.length, before, "nothing before a start date is set");
console.log("ok  nothing announced without a start date, nor without the Carnet's sign-in");

db.settings[0].start_date = dayIso(0);
r = await (await call("POST", { action: "notify", days: [db.days[0].id] }, "a.admin.jwt")).json();
assert.equal(r.days, 0, "a day before the start (a try-out) is never announced");
r = await (await call("POST", { action: "notify", days: [db.days[1].id] }, "a.admin.jwt")).json();
assert.equal(r.days, 1); assert.equal(r.ok, 2); assert.equal(r.gone, 1);
const two = received.slice(-2);
const fr = two.find((x) => x.phone === "maman"), en = two.find((x) => x.phone === "kiwi");
assert.equal(fr.title, "Jour 2 : St Arnaud");
assert.equal(fr.body, "La crête de la Richmond Range. Avec un message vocal.");
assert.equal(en.title, "Day 2: St Arnaud");
assert.equal(en.body, "Along the Richmond Range. With a voice note.");
assert.equal(fr.url, "https://tetordesign-boop.github.io/te-araroa/#/jour/2");
assert.ok(!db.push_subs.some((s) => s.endpoint.endsWith("/gone")), "an unsubscribed phone is forgotten");
r = await (await call("POST", { action: "notify", days: [db.days[1].id] }, "a.admin.jwt")).json();
assert.equal(r.days, 0, "never twice");
console.log("ok  a day announced once, in each phone's language:", JSON.stringify(fr.title), "/", JSON.stringify(en.title));

// (two days sent together, as after a few days without signal)
db.days.push(day(3, dayIso(0)), day(4, dayIso(0)));
r = await (await call("POST", { action: "notify", days: [db.days[2].id, db.days[3].id] }, "a.admin.jwt")).json();
assert.equal(r.days, 2);
const last = received.filter((x) => x.phone === "maman").at(-1);
assert.equal(last.title, "Jours 3 à 4");
assert.equal(last.body, "2 nouvelles étapes dans mon journal.");
assert.equal(last.url, "https://tetordesign-boop.github.io/te-araroa/#/jour/4");
console.log("ok  several days together: one notification,", JSON.stringify(last.title));

const lone = day(5, dayIso(0), { end_name: null });
db.days.push(lone);
await call("POST", { action: "notify", days: [lone.id] }, "a.admin.jwt");
assert.equal(received.filter((x) => x.phone === "maman").at(-1).body, "23,4 km et 1 210 m de montée.");
console.log("ok  a day without a title says its figures:", JSON.stringify(received.filter((x) => x.phone === "maman").at(-1).body));
server.close();
