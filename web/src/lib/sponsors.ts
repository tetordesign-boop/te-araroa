// "Les tickets du sentier": the kilometres of my Te Araroa, each one a ticket a brand or someone close to me can
// sponsor (on the trail you pay the huts with tickets). Only kilometres: they're worked out from the trail's own data
// (its stops, the passes of the map data, the elevation profile), and which ones are taken comes from `sponsor_spots`.
// Buying one is direct: `start_purchase` holds the kilometre a little while (rate limited), the "checkout" server
// function opens a Stripe payment at that price, and once paid it's given automatically (the function checks the
// payment with Stripe itself). One asked for free goes through `request_sponsor` and waits for my yes in the Carnet.
// A gift ("un coup de pouce") is a Stripe payment of the amount chosen, with nothing to give back.
import { computed, signal } from "@preact/signals";
import { MOCK, SUPABASE_KEY, SUPABASE_URL, mediaUrl } from "../config";
import type { Lang } from "../types";
import { deviceId, route, sb } from "./data";
import type { LngLat } from "./geo";
import { pois, profile, shortStation } from "./places";

/** a kilometre of the trail: km k runs from k-1 to k */
export interface Spot {
  id: string;
  kind: "km";
  /** what it's called, in each language */
  name: Record<Lang, string>;
  km: number;
}

/** a spot given to someone: their name, and for a brand its logo (a file in the media bucket) and its link */
export interface Taken { spot_id: string; name: string; logo: string | null; link: string | null }

// ------------------------------------------------------------------ the spots
// passes the map data names twice over: the pass, then its Māori name in a smaller line
const ALT_NAMES: Record<string, string> = { "Poukirikiri / Travers Saddle": "Travers Saddle", "Noti Taramakau / Harper Pass": "Harper Pass" };

/** The trail's stops, short-named: "Arthur's Pass", "Bluff". */
const stops = computed(() => route.value.places().map((s) => ({ n: shortStation(s.n).replace(/\s*\(.*\)$/, ""), km: s.km, c: s.c })));

/** The high passes and summits on the trail (the same as the video kit's), west to east of the profile: landmarks on
 * the skyline that the cursor holds on to, the ticket being the kilometre the pass is on. */
export interface Pass { name: string; km: number; alt?: number }
export const passes = computed<Pass[]>(() => pois.value
  .filter((p) => (p.t === "pass" || p.t === "icon") && (p.e ?? 0) >= 900 && p.d < 600)
  .sort((a, b) => a.km - b.km)
  .map((p) => ({ name: ALT_NAMES[p.n] ?? p.n, km: p.km, alt: p.e ?? undefined })));
/** the kilometre a point of the trail is on */
export const kmOf = (x: number) => Math.min(totalKm.value, Math.max(1, Math.ceil(x)));

export const totalKm = computed(() => Math.round(stops.value[stops.value.length - 1]?.km ?? 1334));

/** One kilometre: km k runs from k-1 to k, named after what's on it or nearest. */
export function kmSpot(k: number): Spot {
  return { id: `km-${k}`, kind: "km", name: { fr: `Kilomètre ${k}`, en: `Kilometre ${k}` }, km: k };
}
/** What a kilometre is near: a stop, a pass, a hut (within 3 km along the trail and close to it), or nothing. */
export function nearKm(k: number): string | null {
  let best: { n: string; d: number } | null = null;
  for (const s of stops.value) { const d = Math.abs(s.km - k); if (d <= 3 && (!best || d < best.d)) best = { n: s.n, d }; }
  for (const p of pois.value) {
    if (!(p.t === "hut" || p.t === "pass" || p.t === "icon" || p.t === "peak" || p.t === "film") || p.d > 1500) continue;
    const d = Math.abs(p.km - k);
    if (d <= 3 && (!best || d < best.d - 0.2)) best = { n: ALT_NAMES[p.n] ?? p.n, d };
  }
  return best?.n ?? null;
}

/** The trail's height at a km (metres), from the profile. */
export function heightAt(km: number): number | null {
  const p = profile.value;
  if (!p?.e.length) return null;
  return p.e[Math.max(0, Math.min(p.e.length - 1, Math.round(km / p.step)))];
}

/** A kilometre by its id ("km-512"), or null for anything else. */
export function spotById(id: string): Spot | null {
  const m = /^km-(\d+)$/.exec(id);
  if (!m) return null;
  const k = +m[1];
  return k >= 1 && k <= totalKm.value ? kmSpot(k) : null;
}

// ------------------------------------------------------------------ taken, and asking for one
export const taken = signal<Map<string, Taken>>(new Map());
export const sponsorsReady = signal<boolean | null>(MOCK ? true : null);
let loading: Promise<void> | null = null;

export function loadTaken(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    if (MOCK) {
      const t = (spot_id: string, name: string, logo: string | null = null, link: string | null = null): [string, Taken] => [spot_id, { spot_id, name, logo, link }];
      taken.value = new Map([
        t("km-640", "Kea Coffee", mockLogo("K", "#1F7A5C", "#F5E9C8"), "https://www.instagram.com/keacoffee"),
        t("km-1", "Tūī Outdoors", mockLogo("T", "#FF6B12", "#1A0A00"), "https://example.com"),
        t("km-300", "Mamie Jo"), t("km-120", "Léa"), t("km-121", "Léa"),
      ]);
      return;
    }
    const { data, error } = await sb.from("sponsor_spots").select("spot_id,name,logo,link");
    if (error) {
      if (/does not exist|schema cache|42P01|PGRST205/i.test(`${error.code} ${error.message}`)) sponsorsReady.value = false;
      loading = null;
      return;
    }
    sponsorsReady.value = true;
    taken.value = new Map((data as Taken[]).map((r) => [r.spot_id, r]));
  })().catch(() => { loading = null; });
  return loading;
}

export type AskResult = "ok" | "rate" | "links" | "closed" | "error";
export interface Ask { who: string; contact: string; link: string; offer: string; message: string }
export async function requestSpot(spot: Spot, a: Ask, lang: Lang): Promise<AskResult> {
  if (MOCK) { await new Promise((r) => setTimeout(r, 500)); return "ok"; }
  const { error } = await sb.rpc("request_sponsor", {
    p_spot: spot.id, p_label: spot.name.fr, p_name: a.who, p_contact: a.contact, p_link: a.link || null, p_offer: a.offer || null,
    p_message: a.message || null, p_lang: lang, p_device: deviceId,
  });
  if (!error) return "ok";
  const m = `${error.code} ${error.message}`;
  if (m.includes("rate_limited")) return "rate";
  if (m.includes("too_many_links")) return "links";
  if (/PGRST202|Could not find the function|does not exist/i.test(m)) return "closed";
  return "error";
}

// ------------------------------------------------------------------ buying a ticket, giving a hand
/** the least a kilometre costs (for nothing, it's a request I answer: nobody fills the map for free), and the most */
export const MIN_EUR = 1;
export const MAX_EUR = 10000;
/** the amounts offered for a gift (any other can be typed) */
export const GIFT_EUR = [5, 10, 20, 50];
const CHECKOUT = `${SUPABASE_URL}/functions/v1/checkout`;

export type BuyResult = { ok: true; url: string } | { ok: false; why: "rate" | "links" | "taken" | "held" | "closed" | "error" };
export interface Buy { who: string; contact: string; link: string; message: string; euros: number; logo: Blob | null }

async function checkout(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(CHECKOUT, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const b64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Holds the spot, then opens the Stripe payment for it: the url to go to, or why not. */
export async function buySpot(spot: Spot, a: Buy, lang: Lang): Promise<BuyResult> {
  if (MOCK) { await new Promise((r) => setTimeout(r, 500)); return { ok: true, url: `${location.pathname}?mock&merci&cs=cs_test_mock_${spot.id}` }; }
  const { data: id, error } = await sb.rpc("start_purchase", {
    p_spot: spot.id, p_label: spot.name.fr, p_name: a.who, p_contact: a.contact, p_link: a.link || null,
    p_message: a.message || null, p_amount_cents: Math.round(a.euros * 100), p_lang: lang, p_device: deviceId,
  });
  if (error) {
    const m = `${error.code} ${error.message}`;
    if (m.includes("rate_limited")) return { ok: false, why: "rate" };
    if (m.includes("too_many_links")) return { ok: false, why: "links" };
    if (m.includes("spot_taken")) return { ok: false, why: "taken" };
    if (m.includes("spot_held")) return { ok: false, why: "held" };
    if (/PGRST202|Could not find the function|does not exist/i.test(m)) return { ok: false, why: "closed" };
    return { ok: false, why: "error" };
  }
  try {
    const r = await checkout({ action: "ticket", request: id, logo: a.logo ? await b64(a.logo) : null });
    if (r.status === 200 && typeof r.data.url === "string") return { ok: true, url: r.data.url };
    if (r.data.error === "taken") return { ok: false, why: "taken" };
    if (r.data.error === "not_configured" || r.status === 404) return { ok: false, why: "closed" };
    return { ok: false, why: "error" };
  } catch (_) { return { ok: false, why: "error" }; }
}

/** A gift of `euros`: the url of its Stripe payment, or null. */
export async function giveGift(euros: number, name: string, message: string, lang: Lang): Promise<string | "closed" | null> {
  if (MOCK) { await new Promise((r) => setTimeout(r, 500)); return `${location.pathname}?mock&merci&cs=cs_test_mock_gift_${Math.round(euros * 100)}`; }
  try {
    const r = await checkout({ action: "gift", amount: Math.round(euros * 100), name: name || null, message: message || null, lang });
    if (r.status === 200 && typeof r.data.url === "string") return r.data.url;
    if (r.data.error === "not_configured" || r.status === 404) return "closed";
    return null;
  } catch (_) { return null; }
}

/** Tickets paid by someone who closed the page before coming back are given here too (the server asks Stripe), then
 * the map is refreshed: asked when the page of tickets opens. */
export async function sweepPayments() {
  if (MOCK) return;
  try {
    const r = await checkout({ action: "sweep" });
    if (r.status === 200 && Number(r.data.given) > 0) await loadTaken(true);
  } catch (_) { /* next time */ }
}

/** Back from Stripe: what was paid (the function asks Stripe itself, and gives the ticket if it was one). */
export type Paid = { kind: "ticket"; status: "paid" | "conflict" | "unpaid"; spot?: string; label?: string; amount?: number } | { kind: "gift"; status: "paid" | "unpaid"; amount?: number } | null;
export async function confirmPayment(session: string): Promise<Paid> {
  if (MOCK) {
    const g = /^cs_test_mock_gift_(\d+)$/.exec(session);
    if (g) return { kind: "gift", status: "paid", amount: +g[1] };
    const t = /^cs_test_mock_(.+)$/.exec(session);
    return t ? { kind: "ticket", status: "paid", spot: t[1], label: spotById(t[1])?.name.fr ?? t[1], amount: 2000 } : null;
  }
  try {
    const r = await checkout({ action: "confirm", session });
    return r.status === 200 ? (r.data as unknown as Paid) : null;
  } catch (_) { return null; }
}

// ------------------------------------------------------------------ logos and where they go on the map
/** the logo's address (a file in the media bucket; the made-up ones of ?mock are drawn inline) */
export const logoSrc = (t: Taken | undefined | null) => (!t?.logo ? null : t.logo.startsWith("data:") ? t.logo : mediaUrl(t.logo));

/** where a kilometre stands on the map: its middle */
export function spotCoord(s: Spot): LngLat {
  return route.value.pointAt(Math.max(0, s.km - 0.5));
}

/** How a link reads on a button: Instagram, or the site's address without its "https://www." */
export function linkLabel(link: string): string {
  try {
    const u = new URL(link);
    if (/(^|\.)instagram\.com$/.test(u.hostname)) { const h = u.pathname.split("/").filter(Boolean)[0]; return h ? `@${h}` : "Instagram"; }
    return u.hostname.replace(/^www\./, "");
  } catch (_) { return link; }
}

function mockLogo(letter: string, bg: string, fg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="${bg}"/><text x="60" y="80" font-family="Arial Black,Arial" font-weight="900" font-size="64" text-anchor="middle" fill="${fg}">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
