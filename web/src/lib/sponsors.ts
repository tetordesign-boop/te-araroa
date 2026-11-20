// "Les tickets du sentier": every spot of my Te Araroa that a brand, or someone close to me, can sponsor. On the trail
// you pay the huts with tickets, so each spot is a ticket: a kilometre, a pass, a section between two stops, the
// start or the finish, a food parcel where no shop is near, a "galère" (blisters, sandflies…), a place on my gear.
// The spots are worked out here from the trail's own data (its stops, the passes of the map data, the elevation
// profile), so nothing is typed twice; which ones are taken comes from `sponsor_spots`, and a request goes through
// `request_sponsor` (rate limited, private until I read it in the Carnet).
import { computed, signal } from "@preact/signals";
import { MOCK, mediaUrl } from "../config";
import type { Lang } from "../types";
import { deviceId, route, sb } from "./data";
import type { LngLat } from "./geo";
import { haversine } from "./geo";
import { pois, profile, shortStation } from "./places";

export type SpotKind = "km" | "col" | "section" | "end" | "colis" | "galere" | "gear";
export interface Spot {
  id: string;
  kind: SpotKind;
  /** what it's called, in each language (place names stay as they are) */
  name: Record<Lang, string>;
  /** where it is on the trail: a point (km), or from km to km2 */
  km?: number;
  km2?: number;
  /** metres, for a pass */
  alt?: number;
}

/** a spot given to someone: their name, and for a brand its logo (a file in the media bucket) and its link */
export interface Taken { spot_id: string; name: string; logo: string | null; link: string | null }

// ------------------------------------------------------------------ the fixed ones
const both = (s: string): Record<Lang, string> => ({ fr: s, en: s });
const GALERES: [string, string, string][] = [
  ["ampoules", "Les ampoules", "Blisters"],
  ["sandflies", "Les sandflies", "Sandflies"],
  ["pluie", "La pluie", "Rain"],
  ["gues", "Les gués", "River crossings"],
  ["faim", "La faim", "Hunger"],
];
const GEAR: [string, string, string][] = [
  ["sac", "Le dos de mon sac", "The back of my pack"],
  ["bretelles", "Les bretelles de mon sac", "My pack's shoulder straps"],
  ["batons", "Mes bâtons", "My trekking poles"],
  ["gourde", "Ma gourde filtrante", "My filter bottle"],
];
// passes the map data names twice over: the pass, then its Māori name in a smaller line
const ALT_NAMES: Record<string, string> = { "Poukirikiri / Travers Saddle": "Travers Saddle", "Noti Taramakau / Harper Pass": "Harper Pass" };
const FOOD = new Set(["super", "general", "conv"]);
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The trail's stops, short-named: "Arthur's Pass", "Bluff". */
const stops = computed(() => route.value.places().map((s) => ({ n: shortStation(s.n).replace(/\s*\(.*\)$/, ""), km: s.km, c: s.c })));

/** The high passes and summits on the trail (the same as the video kit's), west to east of the profile. */
export const cols = computed<Spot[]>(() => pois.value
  .filter((p) => (p.t === "pass" || p.t === "icon") && (p.e ?? 0) >= 900 && p.d < 600)
  .sort((a, b) => a.km - b.km)
  .map((p) => { const n = ALT_NAMES[p.n] ?? p.n; return { id: `col-${slug(n)}`, kind: "col" as const, name: both(n), km: p.km, alt: p.e ?? undefined }; }));

/** One section per stretch between two stops. */
export const sections = computed<Spot[]>(() => {
  const s = stops.value;
  return s.slice(1).map((b, i) => ({ id: `section-${String(i + 1).padStart(2, "0")}`, kind: "section" as const, name: both(`${s[i].n} → ${b.n}`), km: s[i].km, km2: b.km }));
});

/** The stretches of 100 km or more with no food shop on the trail: where a parcel saves carrying everything. */
export const parcelSpots = computed<Spot[]>(() => {
  const st = stops.value;
  if (!st.length || !pois.value.length) return [];
  const label = (p: { c: [number, number]; km: number; n: string; town?: string }) => {
    const near = st.map((s) => ({ s, m: haversine(p.c, s.c) })).sort((a, b) => a.m - b.m)[0];
    if (near && near.m < 3000) return near.s.n;
    if (p.town) return p.town.replace(/ National Park$/, "");
    return near && near.m < 10000 ? near.s.n : p.n;
  };
  const shops = pois.value.filter((p) => p.t === "shop" && FOOD.has(p.sub ?? "")).sort((a, b) => a.km - b.km);
  const marks = [{ n: st[0].n, km: 0 }, ...shops.map((p) => ({ n: label(p), km: p.km })), { n: st[st.length - 1].n, km: st[st.length - 1].km }];
  const out: Spot[] = [];
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1], b = marks[i];
    if (b.km - a.km >= 100) out.push({ id: `colis-${slug(a.n)}-${slug(b.n)}`, kind: "colis", name: both(`${a.n} → ${b.n}`), km: a.km, km2: b.km });
  }
  return out;
});

export const ends = computed<Spot[]>(() => {
  const st = stops.value;
  if (!st.length) return [];
  return [
    { id: "depart", kind: "end", name: both(st[0].n), km: 0 },
    { id: "arrivee", kind: "end", name: both(st[st.length - 1].n), km: st[st.length - 1].km },
  ];
});
export const galeres: Spot[] = GALERES.map(([id, fr, en]) => ({ id: `galere-${id}`, kind: "galere", name: { fr, en } }));
export const gearSpots: Spot[] = GEAR.map(([id, fr, en]) => ({ id: `materiel-${id}`, kind: "gear", name: { fr, en } }));

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

/** Any spot by its id (a kilometre is made on the fly). */
export function spotById(id: string): Spot | null {
  const m = /^km-(\d+)$/.exec(id);
  if (m) { const k = +m[1]; return k >= 1 && k <= totalKm.value ? kmSpot(k) : null; }
  return [...cols.value, ...sections.value, ...ends.value, ...parcelSpots.value, ...galeres, ...gearSpots].find((s) => s.id === id) ?? null;
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
        t("col-goat-pass", "Kea Coffee", mockLogo("K", "#1F7A5C", "#F5E9C8"), "https://www.instagram.com/keacoffee"),
        t("depart", "Tūī Outdoors", mockLogo("T", "#FF6B12", "#1A0A00"), "https://example.com"),
        t("section-02", "Mamie Jo"), t("km-120", "Léa"), t("km-121", "Léa"), t("galere-sandflies", "Bzzz Off"),
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

// ------------------------------------------------------------------ logos and where they go on the map
/** the logo's address (a file in the media bucket; the made-up ones of ?mock are drawn inline) */
export const logoSrc = (t: Taken | undefined | null) => (!t?.logo ? null : t.logo.startsWith("data:") ? t.logo : mediaUrl(t.logo));

/** where a spot stands on the map: a point, or the middle of a stretch; the hardships and my gear stand nowhere */
export function spotCoord(s: Spot): LngLat | null {
  if (s.km === undefined) return null;
  const k = s.km2 !== undefined ? (s.km + s.km2) / 2 : s.km;
  return route.value.pointAt(Math.max(0, k - (s.kind === "km" ? 0.5 : 0)));
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
