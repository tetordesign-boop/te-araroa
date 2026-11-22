// checkout — buying a ticket of the trail, and gifts, paid on Stripe (Checkout), with nothing for me to approve.
//   POST { action: "ticket", request, logo? }  → the Stripe payment page for a ticket held by start_purchase: its price
//                                                and its spot come from the database, never from the browser; the
//                                                buyer's logo (a small PNG) waits in the private "pending" bucket
//   POST { action: "gift", amount, name?, message?, lang } → the Stripe payment page for a gift of that amount
//   POST { action: "confirm", session }        → back from Stripe: asks Stripe itself whether it's paid; if so the
//                                                ticket is given (its logo goes on the map) or the gift is kept. Safe
//                                                to ask again: a ticket is given once
//   POST { action: "sweep" }                   → the same for the tickets still waiting (a buyer who paid and closed
//                                                the page), and the expired ones let go; a few at a time, more for me
//   POST { action: "check" } (me, signed in)   → whether the Stripe key works
// The Stripe key is a restricted key (Checkout Sessions: write), pasted in the Carnet, kept in private.secrets.
import { adminClient, cors, getSecret, isAdminRequest, json } from "../_shared/util.ts";

const SITE = "https://tetordesign-boop.github.io/te-araroa/";
const STRIPE = Deno.env.get("STRIPE_API") ?? "https://api.stripe.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION = /^cs_(live|test)_[A-Za-z0-9_]{6,200}$/;
const HOLD_MIN = 35;

class NotConfigured extends Error {}
class StripeError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Form = Record<string, string>;

/**
 * The amount, changeable on Stripe's own page: 1 € a unit and as many units as euros, the quantity adjustable
 * (Stripe's "the customer chooses the price" isn't open to every account). What's kept is what was really paid.
 */
const MAX_UNITS = 10_000;
function euros(cents: number, desc: string): Form {
  const n = Math.min(MAX_UNITS, Math.max(1, Math.round(cents / 100)));
  return {
    "line_items[0][quantity]": String(n),
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": "100",
    "line_items[0][price_data][product_data][description]": desc,
    "line_items[0][adjustable_quantity][enabled]": "true",
    "line_items[0][adjustable_quantity][minimum]": "1",
    "line_items[0][adjustable_quantity][maximum]": String(MAX_UNITS),
  };
}
const adjust = (en: boolean) => en ? "€1 a unit: change the quantity to change your amount." : "1 € l'unité : change la quantité pour changer ton montant.";
async function stripe(path: string, form?: Form): Promise<Record<string, any>> {
  const key = await getSecret("stripe_key");
  if (!key) throw new NotConfigured("no key");
  const res = await fetch(`${STRIPE}/v1/${path}`, {
    method: form ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(res.status, String(data?.error?.message ?? `stripe ${res.status}`));
  return data;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
/** a link as it goes on the map: https only (an @handle is an Instagram page) */
function normLink(s: string | null): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const h = /^@([A-Za-z0-9._]{1,30})$/.exec(v);
  let out: string | null = null;
  if (h) out = `https://www.instagram.com/${h[1]}`;
  else if (/^https:\/\/\S+$/i.test(v)) out = v;
  else if (/^http:\/\/\S+$/i.test(v)) out = v.replace(/^http:/i, "https:");
  else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) out = `https://${v}`;
  return out && out.length <= 300 ? out : null;
}
const returnTo = () => `${SITE}?merci&cs={CHECKOUT_SESSION_ID}`;

// ---------------------------------------------------------------- a ticket
interface Req {
  id: string; spot_id: string; spot_label: string; name: string; contact: string; link: string | null; message: string | null;
  lang: string; kind: string; status: string; amount_cents: number | null; currency: string | null; hold_until: string | null;
  checkout_id: string | null; logo_tmp: string | null;
}
const REQ = "id,spot_id,spot_label,name,contact,link,message,lang,kind,status,amount_cents,currency,hold_until,checkout_id,logo_tmp";
async function getReq(id: string): Promise<Req | null> {
  const { data, error } = await adminClient().from("sponsor_requests").select(REQ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Req | null;
}
async function spotTaken(spot: string) {
  const { data } = await adminClient().from("sponsor_spots").select("spot_id").eq("spot_id", spot).maybeSingle();
  return !!data;
}

function pngBytes(b64: unknown): Uint8Array | null {
  if (typeof b64 !== "string" || b64.length > 560_000) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch (_) { return null; }
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 64 || bytes.length > 409_600 || !sig.every((x, i) => bytes[i] === x)) return null;
  return bytes;
}

async function ticket(body: Record<string, unknown>) {
  const id = typeof body.request === "string" && UUID.test(body.request) ? body.request : null;
  if (!id) return json({ error: "request" }, 400, cors);
  const db = adminClient();
  const r = await getReq(id);
  if (!r || r.kind !== "buy") return json({ error: "request" }, 404, cors);
  if (r.status !== "pending") return json({ error: r.status === "paid" ? "paid" : "closed" }, 409, cors);
  if (!r.hold_until || Date.parse(r.hold_until) < Date.now()) return json({ error: "expired" }, 410, cors);
  if (await spotTaken(r.spot_id)) return json({ error: "taken" }, 409, cors);
  // the same payment again, while it's open
  if (r.checkout_id) {
    try {
      const s = await stripe(`checkout/sessions/${r.checkout_id}`);
      if (s.status === "open" && s.url) return json({ url: s.url }, 200, cors);
    } catch (e) { if (e instanceof NotConfigured) throw e; }
  }
  // the logo, until it's paid
  const png = pngBytes(body.logo);
  if (png) {
    const name = `${r.id}.png`;
    const { error } = await db.storage.from("pending").upload(name, png, { contentType: "image/png", upsert: true });
    if (!error) await db.from("sponsor_requests").update({ logo_tmp: name }).eq("id", r.id);
  }
  const en = r.lang === "en";
  const label = en ? `Trail ticket: ${r.spot_label}` : `Ticket du sentier : ${r.spot_label}`;
  const form: Form = {
    mode: "payment",
    ...euros(r.amount_cents ?? 100, en
      ? `Te Araroa, the South Island on foot: your name on the trail's map. ${adjust(en)}`
      : `Te Araroa, l'île du Sud à pied : ton nom sur la carte du sentier. ${adjust(en)}`),
    "line_items[0][price_data][product_data][name]": label,
    client_reference_id: r.id,
    "metadata[kind]": "ticket",
    "metadata[request]": r.id,
    "metadata[spot]": r.spot_id,
    "payment_intent_data[description]": label,
    "payment_intent_data[metadata][request]": r.id,
    success_url: returnTo(),
    cancel_url: `${SITE}#/parrainer`,
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
    locale: en ? "en" : "fr",
  };
  if (isEmail(r.contact)) form.customer_email = r.contact;
  const s = await stripe("checkout/sessions", form);
  await db.from("sponsor_requests").update({ checkout_id: s.id, hold_until: new Date(Date.now() + HOLD_MIN * 60_000).toISOString() }).eq("id", r.id);
  return json({ url: s.url }, 200, cors);
}

/** A paid session for a ticket: the spot is given (once), with its logo; taken in between, it's for me to refund. */
async function giveTicket(id: string, s: Record<string, any>) {
  const db = adminClient();
  const amount = Number(s.amount_total) || null;
  const out = (r: Req, status: string) => ({ kind: "ticket", status, spot: r.spot_id, label: r.spot_label, amount: amount ?? r.amount_cents });
  let r = await getReq(id);
  if (!r || r.kind !== "buy") return { kind: "ticket", status: "unpaid" };
  if (r.status === "paid" || r.status === "conflict") return out(r, r.status);
  // only one of two calls at the same time goes on (the page coming back, and a sweep)
  const { data: won } = await db.from("sponsor_requests")
    .update({ status: "paid", paid_at: new Date().toISOString(), amount_cents: amount ?? r.amount_cents, currency: String(s.currency ?? "eur").toLowerCase(), checkout_id: s.id })
    .eq("id", id).in("status", ["pending", "expired"]).select("id");
  if (!won || !(won as unknown[]).length) { r = (await getReq(id))!; return out(r, r.status === "conflict" ? "conflict" : "paid"); }
  let logo: string | null = null;
  if (r.logo_tmp) {
    const { data: blob } = await db.storage.from("pending").download(r.logo_tmp);
    if (blob) {
      const path = `sponsors/${r.spot_id}-${Date.now()}.png`;
      const { error } = await db.storage.from("media").upload(path, blob, { contentType: "image/png", cacheControl: "31536000" });
      if (!error) logo = path;
    }
    await db.storage.from("pending").remove([r.logo_tmp]);
  }
  const { error } = await db.from("sponsor_spots").insert({ spot_id: r.spot_id, name: r.name, link: normLink(r.link), logo });
  if (error) {
    // someone else's ticket got there first
    if (logo) await db.storage.from("media").remove([logo]);
    await db.from("sponsor_requests").update({ status: "conflict", logo_tmp: null }).eq("id", id);
    return out(r, "conflict");
  }
  await db.from("sponsor_requests").update({ logo_tmp: null }).eq("id", id);
  return out(r, "paid");
}

// ---------------------------------------------------------------- a gift
const recent = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now(), list = (recent.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  recent.set(ip, list);
  return list.length > 6;
}

async function gift(body: Record<string, unknown>, ip: string) {
  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 100 || amount > 1_000_000) return json({ error: "amount" }, 400, cors);
  if (tooMany(ip)) return json({ error: "rate" }, 429, cors);
  const en = body.lang === "en";
  const name = clip(body.name, 60), message = clip(body.message, 300);
  const label = en ? "A helping hand for my Te Araroa" : "Un coup de pouce pour mon Te Araroa";
  const form: Form = {
    mode: "payment",
    submit_type: "donate",
    ...euros(amount, adjust(en)),
    "line_items[0][price_data][product_data][name]": label,
    "metadata[kind]": "gift",
    "metadata[lang]": en ? "en" : "fr",
    "payment_intent_data[description]": label,
    success_url: returnTo(),
    cancel_url: `${SITE}#/parrainer`,
    locale: en ? "en" : "fr",
  };
  if (name) form["metadata[name]"] = name;
  if (message) form["metadata[message]"] = message;
  const s = await stripe("checkout/sessions", form);
  return json({ url: s.url }, 200, cors);
}

async function keepGift(s: Record<string, any>) {
  const m = s.metadata ?? {};
  await adminClient().from("gifts").upsert({
    session_id: s.id, amount_cents: Number(s.amount_total) || 0, currency: String(s.currency ?? "eur").toLowerCase(),
    name: clip(m.name, 60) || null, message: clip(m.message, 400) || null,
    email: clip(s.customer_details?.email, 200) || null, lang: m.lang === "en" ? "en" : "fr",
  }, { onConflict: "session_id", ignoreDuplicates: true });
  return { kind: "gift", status: "paid", amount: Number(s.amount_total) || 0 };
}

// ---------------------------------------------------------------- back from Stripe, and the ones that never came back
const isPaid = (s: Record<string, any>) => s.payment_status === "paid" || s.payment_status === "no_payment_required";

async function confirm(body: Record<string, unknown>) {
  const sid = typeof body.session === "string" && SESSION.test(body.session) ? body.session : null;
  if (!sid) return json({ error: "session" }, 400, cors);
  const s = await stripe(`checkout/sessions/${sid}`);
  const kind = s.metadata?.kind;
  if (kind === "gift") return json(isPaid(s) ? await keepGift(s) : { kind: "gift", status: "unpaid" }, 200, cors);
  const id = s.metadata?.request ?? s.client_reference_id;
  if (kind !== "ticket" || typeof id !== "string" || !UUID.test(id)) return json({ error: "session" }, 404, cors);
  if (!isPaid(s)) return json({ kind: "ticket", status: "unpaid" }, 200, cors);
  return json(await giveTicket(id, s), 200, cors);
}

async function sweep(max: number) {
  const db = adminClient();
  const { data } = await db.from("sponsor_requests").select(REQ).eq("kind", "buy").eq("status", "pending")
    .order("created_at", { ascending: true }).limit(max);
  let given = 0, expired = 0;
  for (const r of (data ?? []) as Req[]) {
    const late = !r.hold_until || Date.parse(r.hold_until) < Date.now();
    if (r.checkout_id) {
      let s: Record<string, any> | null = null;
      try { s = await stripe(`checkout/sessions/${r.checkout_id}`); } catch (e) { if (e instanceof NotConfigured) throw e; }
      if (s && isPaid(s)) { await giveTicket(r.id, s); given++; continue; }
      if (s && s.status === "open" && !late) continue;
      if (!s && !late) continue;
    } else if (!late) continue;
    if (r.logo_tmp) await db.storage.from("pending").remove([r.logo_tmp]);
    await db.from("sponsor_requests").update({ status: "expired", logo_tmp: null }).eq("id", r.id).eq("status", "pending");
    expired++;
  }
  return { given, expired };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405, cors);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  try {
    switch (body.action) {
      case "ticket": return await ticket(body);
      case "gift": return await gift(body, ip);
      case "confirm": return await confirm(body);
      case "sweep": {
        const me = await isAdminRequest(req);
        return json(await sweep(me ? 40 : 5), 200, cors);
      }
      case "check": {
        if (!(await isAdminRequest(req))) return json({ error: "unauthorized" }, 401, cors);
        await stripe("checkout/sessions?limit=1");
        return json({ ok: true }, 200, cors);
      }
      default: return json({ error: "unknown action" }, 400, cors);
    }
  } catch (e) {
    if (e instanceof NotConfigured) return json({ error: "not_configured" }, 503, cors);
    if (e instanceof StripeError) { console.error("stripe", e.status, e.message); return json({ error: "stripe", detail: e.status === 401 || e.status === 403 ? "key" : "other" }, 502, cors); }
    console.error("checkout", (e as Error)?.message ?? e);
    return json({ error: "server" }, 500, cors);
  }
});
