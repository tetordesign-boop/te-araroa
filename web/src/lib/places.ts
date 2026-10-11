// Everything a visitor can tap on the map besides Ewan's own days: the huts, campsites, passes, peaks,
// waterfalls and viewpoints along the trail (OpenStreetMap, built by scripts/data/pois.mjs), the trail's
// own towns, and the river and lake crossings that are done by road or boat.
import { computed, signal } from "@preact/signals";
import { fold, type Poi, type PoiGroup, type PoiKind } from "../map/pois";
import { lang } from "../i18n";
import type { Lang } from "../types";
import { route } from "./data";
import { haversine, type LngLat } from "./geo";

export interface TrailProfile { v: number; step: number; total: number; up: number; down: number; max: number; min: number; e: number[] }

export type PlaceKind = PoiKind | "town";

export interface Place {
  id: string;
  t: PlaceKind;
  n: string;
  c: LngLat;
  /** metres; `eApprox` when read from the trail profile rather than the map data */
  e: number | null;
  eApprox?: boolean;
  /** km along the trail (from Ship Cove) and distance from it, in metres */
  km: number;
  d: number;
  poi?: Poi;
  /** towns: index in the trail's list of places */
  station?: number;
  /** transfers: which crossing, and how long the gap is */
  gap?: { key: GapKey | null; m: number };
  /** folded name, for search */
  q: string;
}

export type GapKey = "rakaia" | "rangitata" | "wakatipu";

export const pois = signal<Poi[]>([]);
export const profile = signal<TrailProfile | null>(null);

const KNOWN_GAPS: [number, GapKey, string][] = [
  [559.3, "rakaia", "Rakaia"],
  [628.8, "rangitata", "Rangitata"],
  [994.8, "wakatipu", "Wakatipu"],
];

export function gapName(key: GapKey | null, l: Lang): string {
  switch (key) {
    case "rakaia": return l === "fr" ? "Rivière Rakaia" : "Rakaia River";
    case "rangitata": return l === "fr" ? "Rivière Rangitata" : "Rangitata River";
    case "wakatipu": return l === "fr" ? "Lac Wakatipu" : "Lake Wakatipu";
    default: return l === "fr" ? "Transfert" : "Transfer";
  }
}

/** Elevation of the trail at a km, from the whole-trail profile. */
export function trailElevation(km: number): number | null {
  const p = profile.value;
  if (!p?.e.length) return null;
  const i = Math.max(0, Math.min(p.e.length - 1, Math.round(km / p.step)));
  return p.e[i];
}

export const shortStation = (n: string) => n.replace(" (Klondyke Corner)", "").replace(" · Stirling Point", "").replace(" · Meretoto", "").replace(" · Aparima", "").replace("Lake Coleridge · Rakaia", "Lake Coleridge");

/** The transfers, as places (dashed on the map between two parts of the route). */
export const gapPlaces = computed<Place[]>(() => {
  const r = route.value;
  const out: Place[] = [];
  for (let i = 0; i < r.parts.length - 1; i++) {
    const a = r.parts[i], b = r.parts[i + 1];
    const end: LngLat = [a.lng[a.lng.length - 1], a.lat[a.lat.length - 1]];
    const start: LngLat = [b.lng[0], b.lat[0]];
    const km = a.km[a.km.length - 1];
    const known = KNOWN_GAPS.find(([k]) => Math.abs(k - km) < 15);
    const gap = r.trail.gaps.find((g) => Math.abs(g.km - km) < 1);
    const key = known?.[1] ?? null;
    out.push({
      id: `gap-${key ?? i + 1}`, t: "gap", n: known?.[2] ?? `${i + 1}`,
      c: [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2], e: null, km, d: 0,
      gap: { key, m: gap?.m ?? haversine(end, start) },
      q: fold(`${gapName(key, "fr")} ${gapName(key, "en")} transfert transfer`),
    });
  }
  return out;
});

/**
 * The trail's own stops that the map data already has under the same name close by (Waiau Pass is both),
 * so they are shown once, as the richer map place.
 */
export const duplicateStations = computed(() => {
  const out = new Set<number>();
  const list = pois.value;
  route.value.places().forEach((s, i) => {
    const name = fold(shortStation(s.n));
    if (list.some((p) => fold(p.n) === name && haversine(p.c, s.c) < 1500)) out.add(i);
  });
  return out;
});

/** Every place, ordered along the trail. */
export const places = computed<Place[]>(() => {
  const r = route.value;
  profile.value; // elevations of huts come from the profile
  const dupes = duplicateStations.value;
  const towns: Place[] = r.places().flatMap((p, i) => dupes.has(i) ? [] : [{
    id: `s${i}`, t: "town" as const, n: shortStation(p.n), c: p.c, e: trailElevation(p.km), eApprox: true, km: p.km, d: 0, station: i, q: fold(p.n),
  }]);
  const fromOsm: Place[] = pois.value.map((p) => {
    const approx = p.e === null && p.d < 400 ? trailElevation(p.km) : null;
    return {
      id: p.id, t: p.t, n: p.n, c: p.c, e: p.e ?? approx, eApprox: p.e === null && approx !== null,
      km: p.km, d: p.d, poi: p, q: fold(p.n),
    };
  });
  return [...towns, ...fromOsm, ...gapPlaces.value].sort((a, b) => a.km - b.km || rank(a) - rank(b));
});

const RANK: Record<PlaceKind, number> = { town: 0, gap: 1, hut: 2, pass: 3, camp: 4, peak: 5, fall: 6, view: 7 };
const rank = (p: Place) => RANK[p.t];

export const placeById = computed(() => new Map(places.value.map((p) => [p.id, p])));

/** The places drawn as points of interest on the map (towns are drawn by the map itself). */
export const mapPois = computed<Poi[]>(() => [
  ...pois.value,
  ...gapPlaces.value.map((g): Poi => ({ id: g.id, t: "gap", n: gapName(g.gap?.key ?? null, lang.value), c: g.c, e: null, km: g.km, d: 0, gap: g.gap?.m })),
]);

/** Which groups of places are shown, on the map and in the list (remembered on this device). */
const GROUPS_KEY = "poi-groups-v1";
function initialGroups(): PoiGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.filter((g) => ["huts", "camps", "summits", "sights"].includes(g));
    }
  } catch (_) { /* storage unavailable */ }
  return ["huts", "camps", "summits", "sights"];
}
export const poiGroups = signal<PoiGroup[]>(initialGroups());
export function toggleGroup(g: PoiGroup) {
  const has = poiGroups.value.includes(g);
  poiGroups.value = has ? poiGroups.value.filter((x) => x !== g) : [...poiGroups.value, g];
  try { localStorage.setItem(GROUPS_KEY, JSON.stringify(poiGroups.value)); } catch (_) { /* ignore */ }
}

export function groupOfPlace(p: Place): PoiGroup | null {
  switch (p.t) {
    case "hut": return "huts";
    case "camp": return "camps";
    case "pass": case "peak": return "summits";
    case "fall": case "view": return "sights";
    default: return null;
  }
}

/** Search by name: accents and macrons don't matter ("wanaka" finds Wānaka); names that start with it come first. */
export function searchPlaces(query: string, list: Place[], limit = 60): Place[] {
  const q = fold(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const scored: [number, Place][] = [];
  for (const p of list) {
    if (!words.every((w) => p.q.includes(w))) continue;
    const starts = p.q.startsWith(q) ? 0 : p.q.split(/[\s/·-]+/).some((w) => w.startsWith(words[0])) ? 1 : 2;
    scored.push([starts * 10 + RANK[p.t], p]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].km - b[1].km);
  return scored.slice(0, limit).map(([, p]) => p);
}

/** The next place of one of these kinds after a km. */
export function nextPlace(km: number, kinds: PlaceKind[], list = places.value, minGap = 0.3): Place | null {
  for (const p of list) if (p.km > km + minGap && kinds.includes(p.t)) return p;
  return null;
}

/** Places worth listing when nobody searched (peaks far from the trail stay on the map only). */
export function notable(p: Place): boolean {
  if (p.t !== "peak") return true;
  return p.d <= 1500 || (p.e ?? 0) >= 2200;
}

export async function loadPlaces() {
  const base = import.meta.env.BASE_URL;
  const get = async <T,>(f: string): Promise<T> => {
    const res = await fetch(`${base}data/${f}`, { cache: "default" });
    if (!res.ok) throw new Error(`${f}: ${res.status}`);
    return res.json() as Promise<T>;
  };
  const [p, pr] = await Promise.allSettled([get<{ pois: Poi[] }>("pois.json"), get<TrailProfile>("profile.json")]);
  if (p.status === "fulfilled" && Array.isArray(p.value.pois)) pois.value = p.value.pois;
  else console.warn("places unavailable", p.status === "rejected" ? p.reason : "");
  if (pr.status === "fulfilled" && Array.isArray(pr.value.e)) profile.value = pr.value;
}
