import { signal } from "@preact/signals";
import { TRAIL_URL } from "../config";
import liteTrail from "../data/trail-lite.json";
import { Route } from "../lib/geo";
import type { Day, Media, Settings, Trail } from "../types";
import { sba } from "./sb";

export const adminSettings = signal<Settings | null>(null);
export const adminDays = signal<Day[]>([]);
export const adminMedia = signal<Media[]>([]);
export const adminRoute = signal<Route>(new Route(liteTrail as unknown as Trail));
export const adminRouteFull = signal(false);
export const loadErr = signal<string | null>(null);

const CACHE = "ta-admin-cache-v1";

export function readAdminCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? "null");
    if (c) { adminSettings.value = c.settings; adminDays.value = c.days ?? []; adminMedia.value = c.media ?? []; }
  } catch (_) { /* ignore */ }
}

export async function loadServer() {
  try {
    const [s, d, m] = await Promise.all([
      sba.from("settings").select("*").eq("id", 1).single(),
      sba.from("days").select("*").order("date"),
      sba.from("media").select("*").order("sort"),
    ]);
    if (s.error) throw s.error;
    adminSettings.value = s.data as Settings;
    adminDays.value = (d.data ?? []) as Day[];
    adminMedia.value = (m.data ?? []) as Media[];
    loadErr.value = null;
    try { localStorage.setItem(CACHE, JSON.stringify({ settings: s.data, days: d.data, media: m.data })); } catch (_) { /* quota */ }
  } catch (e) {
    loadErr.value = navigator.onLine ? (e as Error).message : null;
  }
}

export async function loadRoute() {
  try {
    const cached = await caches?.open?.("ta-admin-trail").then((c) => c.match(TRAIL_URL)).catch(() => undefined);
    const res = navigator.onLine ? await fetch(TRAIL_URL).catch(() => cached) : cached;
    if (!res || !res.ok) return;
    const clone = res.clone();
    const trail = (await res.json()) as Trail;
    if (trail?.parts?.length) {
      adminRoute.value = new Route(trail);
      adminRouteFull.value = true;
      if (navigator.onLine) caches?.open?.("ta-admin-trail").then((c) => c.put(TRAIL_URL, clone)).catch(() => {});
    }
  } catch (_) { /* keep the light route */ }
}
