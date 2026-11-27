// "Mon étape": where I am on the trail and what is ahead, worked out on the phone, with no network once the trail
// and the map data have been loaded once (the full trail is kept by server.ts, pois.json and profile.json by the
// service worker). The phone's GPS is snapped to the trail; the places ahead come from the site's map data; the
// climbs from the trail's height profile; walking times from my own pace (learned from my published days).
import { computed, signal } from "@preact/signals";
import type { LngLat } from "../lib/geo";
import { nzToday } from "../lib/format";
import { kindLabel, type Poi } from "../map/pois";
import { adminDays, adminRoute } from "./server";

// ------------------------------------------------------------------ data
export interface Profile { step: number; total: number; e: number[] }
export const planPois = signal<Poi[]>([]);
export const planProfile = signal<Profile | null>(null);
let loading: Promise<void> | null = null;

/** The map points and the height profile (the service worker keeps both for the days without signal). */
export function loadPlanData(): Promise<void> {
  if (loading) return loading;
  const base = import.meta.env.BASE_URL;
  const get = (f: string) => fetch(`${base}data/${f}`, { cache: "default" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  loading = Promise.allSettled([get("pois.json"), get("profile.json")]).then(([p, pr]) => {
    if (p.status === "fulfilled" && Array.isArray(p.value?.pois)) planPois.value = p.value.pois;
    if (pr.status === "fulfilled" && Array.isArray(pr.value?.e)) planProfile.value = pr.value;
    loading = planPois.value.length && planProfile.value ? loading : null; // try again later if something is missing
  });
  return loading;
}

/** Height of the trail at a km (metres), from the whole-trail profile. */
export function elevAt(km: number): number | null {
  const p = planProfile.value; if (!p) return null;
  const x = Math.max(0, Math.min(p.e.length - 1, km / p.step)), i = Math.floor(x), f = x - i;
  return p.e[i] + ((p.e[Math.min(i + 1, p.e.length - 1)] ?? p.e[i]) - p.e[i]) * f;
}

/** Climb, descent and high point between two km. */
export function climb(k0: number, k1: number): { up: number; down: number; max: number; maxKm: number } {
  const p = planProfile.value;
  if (!p || k1 <= k0) return { up: 0, down: 0, max: elevAt(k0) ?? 0, maxKm: k0 };
  let up = 0, down = 0, prev = elevAt(k0) ?? 0, max = prev, maxKm = k0;
  for (let km = Math.ceil(k0 / p.step) * p.step; km <= k1 + 1e-9; km += p.step) {
    const e = elevAt(km) ?? prev; const d = e - prev;
    if (d > 0) up += d; else down -= d;
    if (e > max) { max = e; maxKm = km; }
    prev = e;
  }
  const e1 = elevAt(k1) ?? prev; const d = e1 - prev; if (d > 0) up += d; else down -= d;
  return { up: Math.round(up), down: Math.round(down), max: Math.round(max), maxKm };
}

// ------------------------------------------------------------------ the places along the trail
export type StopKind = "town" | "hut" | "camp" | "water" | "shop" | "pass" | "gap";
export interface Stop { id: string; kind: StopKind; name: string; km: number; c: LngLat; e: number | null; d: number; poi?: Poi; note?: string }

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GAPS: [number, string, string][] = [
  [559.3, "Rivière Rakaia", "Pas de passage à gué : transfert par la route"],
  [628.8, "Rivière Rangitata", "Pas de passage à gué : transfert par la route"],
  [994.8, "Lac Wakatipu", "Traversée en bateau ou par la route"],
];
const KINDS = new Set<StopKind>(["hut", "camp", "water", "shop", "pass"]);

export const stops = computed<Stop[]>(() => {
  const r = adminRoute.value;
  const fromMap: Stop[] = planPois.value
    .filter((p) => KINDS.has(p.t as StopKind) && p.d <= 1500)
    .map((p) => ({ id: p.id, kind: p.t as StopKind, name: p.n || kindLabel(p, "fr"), km: p.km, c: p.c, e: p.e ?? elevAt(p.km), d: p.d, poi: p }));
  const named = new Set(fromMap.map((s) => fold(s.name)));
  const towns: Stop[] = r.places()
    .map((p, i) => ({ id: `s${i}`, kind: "town" as const, name: p.n.replace(/\s*\(.*\)$/, ""), km: p.km, c: p.c as LngLat, e: elevAt(p.km), d: 0 }))
    .filter((s) => !named.has(fold(s.name)));
  const gaps: Stop[] = [];
  for (let i = 0; i < r.parts.length - 1; i++) {
    const a = r.parts[i], km = a.km[a.km.length - 1];
    const known = GAPS.find(([k]) => Math.abs(k - km) < 15);
    gaps.push({ id: `gap${i}`, kind: "gap", name: known?.[1] ?? "Transfert", km, c: [a.lng[a.lng.length - 1], a.lat[a.lat.length - 1]], e: null, d: 0, note: known?.[2] ?? "Portion sans sentier : transfert" });
  }
  return [...towns, ...fromMap, ...gaps].sort((a, b) => a.km - b.km);
});

/** Places between two km (the ones a little behind are kept off). */
export const between = (k0: number, k1: number, kinds?: StopKind[]) =>
  stops.value.filter((s) => s.km > k0 + 0.05 && s.km <= k1 && (!kinds || kinds.includes(s.kind)));

// ------------------------------------------------------------------ pace
export type PacePreset = "auto" | "calm" | "normal" | "fast";
export const PACE_LABEL: Record<PacePreset, string> = { auto: "Auto", calm: "Tranquille", normal: "Normale", fast: "Rapide" };
const PACE_FACTOR = { calm: 1.25, normal: 1, fast: 0.85 } as const;
const PREFS_KEY = "ta-plan-prefs";
export const prefs = signal<{ pace: PacePreset; hours: number }>(read(PREFS_KEY, { pace: "auto", hours: 8 }));
export function setPrefs(p: Partial<{ pace: PacePreset; hours: number }>) { prefs.value = { ...prefs.value, ...p }; write(PREFS_KEY, prefs.value); }

/** Walking time (hours, without breaks) by a rule for loaded hiking on rough ground: 4 km/h, 600 m of climb an hour,
 * a little for long descents. My own factor scales it. */
export const baseHours = (km: number, up: number, down: number) => km / 4 + up / 600 + down / 1800;

/** My real pace from my published days (time walked against the rule), once I have at least two. */
export const learned = computed<{ factor: number; days: number } | null>(() => {
  const ds = adminDays.value
    .filter((d) => d.kind === "hike" && (d.moving_time_min ?? 0) > 30 && (d.distance_km ?? 0) > 3)
    .slice(-7);
  let real = 0, rule = 0;
  for (const d of ds) { real += (d.moving_time_min ?? 0) / 60; rule += baseHours(d.distance_km ?? 0, d.ascent_m ?? 0, d.descent_m ?? 0); }
  if (ds.length < 2 || rule <= 0) return null;
  return { factor: Math.min(2, Math.max(0.6, real / rule)), days: ds.length };
});
export const factor = computed(() => {
  const p = prefs.value.pace;
  return p === "auto" ? (learned.value?.factor ?? 1) : PACE_FACTOR[p];
});
export function walkHours(k0: number, k1: number) {
  const c = climb(k0, k1);
  return { ...c, km: k1 - k0, hours: baseHours(k1 - k0, c.up, c.down) * factor.value };
}
export const fmtHours = (h: number) => { const m = Math.round(h * 60 / 10) * 10; return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };

// ------------------------------------------------------------------ where I am
export interface Fix { c: LngLat; acc: number; at: number }
const FIX_KEY = "ta-plan-fix", SIM_KEY = "ta-plan-sim";
export const fix = signal<Fix | null>(read(FIX_KEY, null));
export const sim = signal<{ on: boolean; km: number }>(read(SIM_KEY, { on: false, km: 0 }));
export const locating = signal(false);
export function setSim(s: Partial<{ on: boolean; km: number }>) { sim.value = { ...sim.value, ...s }; write(SIM_KEY, sim.value); }

/** The phone's GPS (works with no network). */
export function locate(): Promise<string | null> {
  return new Promise((done) => {
    if (!("geolocation" in navigator)) { done("La localisation n'est pas disponible sur ce téléphone."); return; }
    locating.value = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        locating.value = false;
        fix.value = { c: [p.coords.longitude, p.coords.latitude], acc: Math.round(p.coords.accuracy), at: Date.now() };
        write(FIX_KEY, fix.value); setSim({ on: false }); done(null);
      },
      (e) => { locating.value = false; done(e.code === e.PERMISSION_DENIED ? "Autorise la localisation pour le Carnet dans Réglages › Safari › Position." : "Pas de position : réessaie à découvert, le GPS met parfois une minute."); },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 20000 },
    );
  });
}

export interface Here { km: number; source: "gps" | "sim" | "day" | "start"; off?: number; acc?: number; at?: number; label: string }
export const here = computed<Here>(() => {
  const r = adminRoute.value;
  if (sim.value.on) return { km: Math.min(r.total, Math.max(0, sim.value.km)), source: "sim", label: "Simulation" };
  const f = fix.value;
  if (f) { const n = r.nearest(f.c); return { km: n.km, source: "gps", off: Math.round(n.dist), acc: f.acc, at: f.at, label: "GPS" }; }
  const last = [...adminDays.value].reverse().find((d) => d.end_km !== null && d.kind === "hike");
  if (last?.end_km != null) return { km: last.end_km, source: "day", label: `Fin du jour ${last.day_number}` };
  return { km: 0, source: "start", label: "Le départ, à Ship Cove" };
});

// ------------------------------------------------------------------ the plan for a day
export interface Plan { date: string; fromKm: number; toKm: number; toId: string; toName: string; toC: LngLat; hours: number; savedAt: number }
const PLAN_KEY = "ta-plan";
export const plan = signal<Plan | null>(read(PLAN_KEY, null));
export function savePlan(p: Plan | null) { plan.value = p; write(PLAN_KEY, p); }

/** Before 14:00 in New Zealand I plan today, after it tomorrow. */
export function defaultPlanDate(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Pacific/Auckland", hour: "2-digit", hour12: false }).format(now));
  return h < 14 ? nzToday(now) : addDays(nzToday(now), 1);
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** Where I could sleep: huts, campsites and towns from 5 to 45 km ahead, with the one closest to my day suggested. */
export function candidates(km: number) {
  const list = between(km + 4, km + 45, ["hut", "camp", "town"]).map((s) => ({ s, ...walkHours(km, s.km) }));
  const want = prefs.value.hours;
  let best: (typeof list)[number] | null = null;
  for (const c of list) {
    const score = c.hours <= want ? want - c.hours : (c.hours - want) * 2.5; // going over the day costs more
    if (!best || score < (best.hours <= want ? want - best.hours : (best.hours - want) * 2.5)) best = c;
  }
  return { list, best };
}

// ------------------------------------------------------------------ the sun (no network: computed)
const RAD = Math.PI / 180, J1970 = 2440588, J2000 = 2451545, DAY = 864e5, E = RAD * 23.4397;
/** Sunrise and sunset on a date (YYYY-MM-DD, New Zealand) at a place. */
export function sunTimes(date: string, [lng, lat]: LngLat): { rise: Date; set: Date } | null {
  const d = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 0) / DAY - 0.5 + J1970 - J2000; // 13:00 NZDT
  const lw = RAD * -lng, phi = RAD * lat;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(E) * Math.sin(L));
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH < -1 || cosH > 1) return null;
  const set = J2000 + (0.0009 + (Math.acos(cosH) + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const rise = noon - (set - noon);
  const toDate = (j: number) => new Date((j + 0.5 - J1970) * DAY);
  return { rise: toDate(rise), set: toDate(set) };
}
export const nzClock = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", " h ");

// ------------------------------------------------------------------ storage
function read<T>(k: string, def: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : def; } catch (_) { return def; } }
function write(k: string, v: unknown) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } }
