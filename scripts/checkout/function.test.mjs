// Runs the "checkout" server function (supabase/functions/checkout) in Node against a pretend database, a pretend
// storage and a pretend Stripe, to check the whole path of a ticket bought and of a gift: nothing works without the
// key; the price comes from the request, never from the browser; a ticket is given once, only when Stripe says it's
// paid, with its logo; a spot taken in between is for me to refund; a buyer who never came back still gets the ticket.
// Run: node --experimental-strip-types --no-warnings scripts/checkout/function.test.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../supabase/functions/", import.meta.url).pathname;
const read = (f) => readFileSync(root + f, "utf8");
const src = [read("_shared/util.ts"), read("checkout/index.ts").replace(/^import .* from "\.\.\/_shared\/[^"]+";\n/gm, "")]
  .join("\n").replace(/^import \{ createClient, type SupabaseClient \} from "npm:@supabase\/supabase-js@[^"]+";$/m, "const createClient = (globalThis as any).__createClient; type SupabaseClient = any;");
const dir = mkdtempSync(join(tmpdir(), "checkoutfn-"));
writeFileSync(join(dir, "checkout.ts"), src);

// ---------------------------------------------------------------- a pretend database and storage
const db = { sponsor_requests: [], sponsor_spots: [], gifts: [], admins: [{ user_id: "u1" }] };
const files = { pending: new Map(), media: new Map() };
const secrets = new Map();
function table(name) {
  let filters = [], op = "select", payload = null, single = false, limit = null, returning = false, opts = {};
  const q = {
    select() { if (op !== "select") returning = true; return q; }, order() { return q; },
    eq(c, v) { filters.push((r) => r[c] === v); return q; },
    in(c, v) { filters.push((r) => v.includes(r[c])); return q; },
    limit(n) { limit = n; return q; },
    maybeSingle() { single = true; return q; },
    insert(v) { op = "insert"; payload = v; return q; },
    upsert(v, o) { op = "upsert"; payload = v; opts = o ?? {}; return q; },
    update(v) { op = "update"; payload = v; return q; },
    delete() { op = "delete"; return q; },
    then(res, rej) {
      try {
        const rows = db[name], match = (r) => filters.every((f) => f(r));
        if (op === "insert") {
          if (name === "sponsor_spots" && rows.some((r) => r.spot_id === payload.spot_id)) return res({ data: null, error: { message: "duplicate key" } });
          rows.push({ ...payload }); return res({ data: null, error: null });
        }
        if (op === "upsert") {
          const k = opts.onConflict, hit = rows.find((r) => r[k] === payload[k]);
          if (hit) { if (!opts.ignoreDuplicates) Object.assign(hit, payload); } else rows.push({ ...payload });
          return res({ data: null, error: null });
        }
        if (op === "update") { const hit = rows.filter(match); for (const r of hit) Object.assign(r, payload); return res({ data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null }); }
        if (op === "delete") { db[name] = rows.filter((r) => !match(r)); return res({ data: null, error: null }); }
        let out = rows.filter(match).map((r) => ({ ...r }));
        if (limit) out = out.slice(0, limit);
        return res({ data: single ? out[0] ?? null : out, error: null });
      } catch (e) { rej(e); }
    },
  };
  return q;
}
const storage = {
  from: (b) => ({
    upload: async (path, body) => { files[b].set(path, body instanceof Uint8Array ? body : new Uint8Array(await body.arrayBuffer())); return { error: null }; },
    download: async (path) => (files[b].has(path) ? { data: new Blob([files[b].get(path)]), error: null } : { data: null, error: { message: "not found" } }),
    remove: async (paths) => { for (const p of paths) files[b].delete(p); return { error: null }; },
  }),
};
globalThis.__createClient = () => ({
  from: table, storage,
  rpc: async (fn, a) => (fn === "svc_get_secret" ? { data: secrets.get(a.p_key) ?? null, error: null } : { data: null, error: { message: `no rpc ${fn}` } }),
  auth: { getUser: async (t) => (t === "a.admin.jwt" ? { data: { user: { id: "u1" } }, error: null } : { data: null, error: { message: "bad" } }) },
});

// ---------------------------------------------------------------- a pretend Stripe
const sessions = new Map();
let made = 0;
const stripe = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.headers.authorization !== "Bearer rk_test_" + "a".repeat(24)) return send(401, { error: { message: "Invalid API Key" } });
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const f = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
    const id = `cs_test_${String(++made).padStart(8, "0")}`;
    const metadata = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith("metadata[")).map(([k, v]) => [k.slice(9, -1), v]));
    const s = { id, url: `https://checkout.stripe.com/c/pay/${id}`, status: "open", payment_status: "unpaid", client_reference_id: f.client_reference_id ?? null, metadata, form: f,
      amount_total: Number(f["line_items[0][price_data][unit_amount]"]), currency: f["line_items[0][price_data][currency]"], customer_details: { email: "buyer@example.org" } };
    sessions.set(id, s);
    return send(200, s);
  }
  if (req.method === "GET" && url.pathname === "/v1/checkout/sessions") return send(200, { data: [] });
  const m = /^\/v1\/checkout\/sessions\/(cs_test_\w+)$/.exec(url.pathname);
  if (req.method === "GET" && m) return sessions.has(m[1]) ? send(200, sessions.get(m[1])) : send(404, { error: { message: "No such session" } });
  send(404, { error: { message: "?" } });
});
await new Promise((r) => stripe.listen(0, r));
const pay = (id) => { const s = sessions.get(id); s.payment_status = "paid"; s.status = "complete"; };

let handler;
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => ({ SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "service", STRIPE_API: `http://localhost:${stripe.address().port}` })[k] } };
await import(join(dir, "checkout.ts"));
const call = async (body, token) => {
  const r = await handler(new Request("http://fn/checkout", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  return { status: r.status, data: await r.json() };
};
// what start_purchase leaves in the database: a ticket held for its buyer
let n = 0;
const held = (spot, extra = {}) => {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  db.sponsor_requests.push({ id, spot_id: spot, spot_label: spot === "km-1" ? "Kilomètre 1" : spot, name: "Kea Coffee", contact: "hello@kea.example", link: "@keacoffee", message: null,
    lang: "fr", kind: "buy", status: "pending", amount_cents: 2000, currency: "eur", hold_until: new Date(Date.now() + 35 * 60e3).toISOString(), checkout_id: null, logo_tmp: null,
    created_at: new Date().toISOString(), ...extra });
  return id;
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 7)]).toString("base64");

// ---------------------------------------------------------------- the checks
const a = held("km-1");
let r = await call({ action: "ticket", request: a, logo: PNG });
assert.equal(r.status, 503); assert.equal(r.data.error, "not_configured");
console.log("ok  nothing opens without the Stripe key");

secrets.set("stripe_key", "rk_test_" + "a".repeat(24));
r = await call({ action: "ticket", request: a, logo: PNG, amount: 1 });
assert.equal(r.status, 200); assert.match(r.data.url, /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
const s1 = [...sessions.values()].at(-1);
assert.equal(s1.form["line_items[0][price_data][unit_amount]"], "2000", "the price is the request's, not the browser's");
assert.equal(s1.form["line_items[0][price_data][product_data][name]"], "Ticket du sentier : Kilomètre 1");
assert.equal(s1.client_reference_id, a);
assert.equal(s1.form.customer_email, "hello@kea.example");
assert.equal(s1.form.success_url, "https://tetordesign-boop.github.io/te-araroa/?merci&cs={CHECKOUT_SESSION_ID}");
assert.ok(files.pending.has(`${a}.png`), "the logo waits, private");
r = await call({ action: "ticket", request: a });
assert.equal(r.data.url, s1.url, "the same payment page while it's open");
console.log("ok  a ticket's payment opens at its own price, the logo kept aside");

r = await call({ action: "confirm", session: s1.id });
assert.deepEqual(r.data, { kind: "ticket", status: "unpaid" });
assert.equal(db.sponsor_spots.length, 0, "nothing given before it's paid");
pay(s1.id);
r = await call({ action: "confirm", session: s1.id });
assert.equal(r.data.status, "paid"); assert.equal(r.data.spot, "km-1"); assert.equal(r.data.label, "Kilomètre 1"); assert.equal(r.data.amount, 2000);
const spot = db.sponsor_spots.find((x) => x.spot_id === "km-1");
assert.equal(spot.name, "Kea Coffee");
assert.equal(spot.link, "https://www.instagram.com/keacoffee");
assert.match(spot.logo, /^sponsors\/km-1-\d+\.png$/); assert.ok(files.media.has(spot.logo)); assert.ok(!files.pending.has(`${a}.png`));
assert.equal(db.sponsor_requests.find((x) => x.id === a).status, "paid");
r = await call({ action: "confirm", session: s1.id });
assert.equal(r.data.status, "paid"); assert.equal(db.sponsor_spots.length, 1, "given once");
console.log("ok  paid: the ticket is given, with its logo on the map and its link; once");

r = await call({ action: "ticket", request: held("km-1") });
assert.equal(r.status, 409); assert.equal(r.data.error, "taken");
const b = held("col-stag-saddle"), c = held("col-stag-saddle", { name: "Tūī Outdoors", device_id: "x" });
const sb1 = (await call({ action: "ticket", request: b })).data.url.split("/").pop();
const sc1 = (await call({ action: "ticket", request: c })).data.url.split("/").pop();
pay(sb1); pay(sc1);
assert.equal((await call({ action: "confirm", session: sb1 })).data.status, "paid");
assert.equal((await call({ action: "confirm", session: sc1 })).data.status, "conflict");
assert.equal(db.sponsor_spots.find((x) => x.spot_id === "col-stag-saddle").name, "Kea Coffee");
console.log("ok  a spot taken in between: the second payment is marked to refund");

// a buyer who paid and closed the page, and one who never paid
const d = held("section-02"), e = held("section-03");
const sd = (await call({ action: "ticket", request: d, logo: PNG })).data.url.split("/").pop();
await call({ action: "ticket", request: e, logo: PNG });
pay(sd);
db.sponsor_requests.find((x) => x.id === e).hold_until = new Date(Date.now() - 60e3).toISOString();
sessions.get(db.sponsor_requests.find((x) => x.id === e).checkout_id).status = "expired";
r = await call({ action: "sweep" });
assert.deepEqual(r.data, { given: 1, expired: 1 });
assert.ok(db.sponsor_spots.some((x) => x.spot_id === "section-02"));
assert.equal(db.sponsor_requests.find((x) => x.id === e).status, "expired"); assert.ok(!files.pending.has(`${e}.png`));
console.log("ok  the sweep gives a ticket paid by someone who never came back, and lets the unpaid ones go");

r = await call({ action: "gift", amount: 50 });
assert.equal(r.status, 400, "a gift is at least 1 €");
r = await call({ action: "gift", amount: 2000, name: "Mamie Jo", message: "Bonne route  mon grand !", lang: "fr" });
const g = [...sessions.values()].at(-1);
assert.equal(g.form.submit_type, "donate"); assert.equal(g.form["line_items[0][price_data][unit_amount]"], "2000");
assert.equal(g.metadata.name, "Mamie Jo"); assert.equal(g.metadata.message, "Bonne route mon grand !");
assert.deepEqual((await call({ action: "confirm", session: g.id })).data, { kind: "gift", status: "unpaid" });
pay(g.id);
assert.deepEqual((await call({ action: "confirm", session: g.id })).data, { kind: "gift", status: "paid", amount: 2000 });
await call({ action: "confirm", session: g.id });
assert.equal(db.gifts.length, 1, "kept once");
assert.equal(db.gifts[0].name, "Mamie Jo"); assert.equal(db.gifts[0].email, "buyer@example.org");
console.log("ok  a gift of the amount chosen, kept once paid, with its name and its word");

assert.equal((await call({ action: "confirm", session: "cs_test_<script>" })).status, 400);
assert.equal((await call({ action: "check" })).status, 401);
assert.equal((await call({ action: "check" }, "a.admin.jwt")).data.ok, true);
secrets.set("stripe_key", "rk_test_wrong_key_wrong_key_xx");
r = await call({ action: "check" }, "a.admin.jwt");
assert.equal(r.status, 502); assert.equal(r.data.detail, "key");
console.log("ok  odd sessions refused; the key check is mine and says when the key is wrong");
stripe.close();
