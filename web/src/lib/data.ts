import { batch, computed, signal } from "@preact/signals";
import { createClient } from "@supabase/supabase-js";
import { LIVE_THRESHOLD_MIN, MOCK, SUPABASE_KEY, SUPABASE_URL, TRAIL_URL } from "../config";
import { hikerName } from "../i18n";
import type { Day, DayReactions, Media, Position, ReactionKey, Settings, Trail } from "../types";
import liteTrail from "../data/trail-lite.json";
import { mergeRanges, Route, type LngLat } from "./geo";
import { daysBetween, nzToday } from "./format";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------- state
export const settings = signal<Settings | null>(null);
export const days = signal<Day[]>([]);
export const media = signal<Media[]>([]);
export const positions = signal<Position[]>([]); // ascending by time
export const reactions = signal<Record<string, DayReactions>>({});
export const route = signal<Route>(new Route(liteTrail as unknown as Trail));
export const fullRouteLoaded = signal(false);
export const status = signal<"loading" | "ready" | "error">("loading");
export const offline = signal(typeof navigator !== "undefined" ? !navigator.onLine : false);
export const lastUpdate = signal<number>(0);
export const clock = signal(Date.now());

const DAY_COLS =
  "id,date,day_number,kind,title,title_en,story,story_en,start_km,end_km,start_lng,start_lat,end_lng,end_lat,start_name,end_name,distance_km,ascent_m,descent_m,moving_time_min,weather,mood,cover_media_id,track,published,created_at,updated_at";
const MEDIA_COLS = "id,day_id,kind,path,thumb_path,embed_url,width,height,duration_s,taken_at,lng,lat,caption,caption_en,sort";
const POS_COLS = "id,recorded_at,lng,lat,alt,acc,source,note";

// ---------------------------------------------------------------- device id (reactions)
export const deviceId: string = (() => {
  try {
    let id = localStorage.getItem("device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("device", id); }
    return id;
  } catch (_) {
    return crypto.randomUUID();
  }
})();

// ---------------------------------------------------------------- cache (instant start)
const CACHE_KEY = "journal-cache-v1";
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const c = JSON.parse(raw);
    batch(() => {
      settings.value = c.settings ?? null;
      days.value = c.days ?? [];
      media.value = c.media ?? [];
      positions.value = c.positions ?? [];
      reactions.value = c.reactions ?? {};
      if (settings.value?.hiker_name) hikerName.value = settings.value.hiker_name;
    });
    return true;
  } catch (_) {
    return false;
  }
}
function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      settings: settings.value, days: days.value, media: media.value, positions: positions.value.slice(-150),
      reactions: reactions.value, at: Date.now(),
    }));
  } catch (_) { /* quota or private mode */ }
}

// ---------------------------------------------------------------- loading
async function fetchRemote() {
  const [s, d, m, p, r] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("days").select(DAY_COLS).eq("published", true).order("date"),
    sb.from("media").select(MEDIA_COLS).order("sort").order("taken_at"),
    sb.from("positions").select(POS_COLS).order("recorded_at", { ascending: false }).limit(400),
    sb.rpc("get_reactions", { p_device: deviceId }),
  ]);
  for (const res of [s, d, m, p]) if (res.error) throw res.error;
  const rx: Record<string, DayReactions> = {};
  for (const row of (r.data ?? []) as { day_id: string; emoji_key: ReactionKey; total: number; mine: boolean }[]) {
    (rx[row.day_id] ??= {})[row.emoji_key] = { total: row.total, mine: row.mine };
  }
  return {
    settings: s.data as Settings,
    days: (d.data ?? []) as Day[],
    media: (m.data ?? []) as Media[],
    positions: ((p.data ?? []) as Position[]).reverse(),
    reactions: rx,
  };
}

export async function loadAll(): Promise<void> {
  try {
    const data = MOCK ? await (await import("../dev/mock")).mockData(route.value) : await fetchRemote();
    batch(() => {
      settings.value = data.settings;
      days.value = data.days;
      media.value = data.media;
      positions.value = data.positions;
      reactions.value = data.reactions;
      if (data.settings?.hiker_name) hikerName.value = data.settings.hiker_name;
      status.value = "ready";
      lastUpdate.value = Date.now();
    });
    if (!MOCK) writeCache();
  } catch (e) {
    console.warn("load failed", e);
    if (status.value !== "ready") status.value = days.value.length || settings.value ? "ready" : "error";
  }
}

async function loadFullTrail() {
  if (MOCK) return;
  try {
    const res = await fetch(TRAIL_URL, { cache: "default" });
    if (!res.ok) throw new Error(String(res.status));
    const trail = (await res.json()) as Trail;
    if (trail?.parts?.length) {
      route.value = new Route(trail);
      fullRouteLoaded.value = true;
    }
  } catch (e) {
    console.warn("full trail unavailable, keeping the light version", e);
  }
}

async function refreshPositions() {
  if (MOCK) return;
  const { data, error } = await sb.from("positions").select(POS_COLS).order("recorded_at", { ascending: false }).limit(400);
  if (!error && data) { positions.value = (data as Position[]).reverse(); writeCache(); }
}

let reloadTimer: number | undefined;
function scheduleReload(ms = 1500) {
  clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => loadAll(), ms);
}

export function startData() {
  if (!MOCK && readCache()) status.value = "ready";
  loadAll();
  loadFullTrail();
  window.addEventListener("online", () => { offline.value = false; loadAll(); });
  window.addEventListener("offline", () => { offline.value = true; });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastUpdate.value > 60_000) loadAll();
  });
  window.setInterval(() => { clock.value = Date.now(); }, 30_000);
  window.setInterval(() => { if (document.visibilityState === "visible") refreshPositions(); }, 120_000);
  if (MOCK) return;
  try {
    sb.channel("journal")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "positions" }, (payload) => {
        const p = payload.new as Position;
        if (!positions.value.some((x) => x.id === p.id)) {
          positions.value = [...positions.value, p].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "days" }, () => scheduleReload())
      .on("postgres_changes", { event: "*", schema: "public", table: "media" }, () => scheduleReload(4000))
      .subscribe();
  } catch (e) {
    console.warn("realtime unavailable", e);
  }
}

// ---------------------------------------------------------------- reactions & messages
export async function toggleReaction(dayId: string, key: ReactionKey) {
  const cur = reactions.value[dayId]?.[key] ?? { total: 0, mine: false };
  const optimistic = { total: Math.max(0, cur.total + (cur.mine ? -1 : 1)), mine: !cur.mine };
  reactions.value = { ...reactions.value, [dayId]: { ...reactions.value[dayId], [key]: optimistic } };
  if (MOCK) return;
  const { data, error } = await sb.rpc("toggle_reaction", { p_day: dayId, p_emoji: key, p_device: deviceId });
  if (error) {
    reactions.value = { ...reactions.value, [dayId]: { ...reactions.value[dayId], [key]: cur } };
    return;
  }
  const next: DayReactions = {};
  for (const row of data as { emoji_key: ReactionKey; total: number; mine: boolean }[]) {
    next[row.emoji_key] = { total: row.total, mine: row.mine };
  }
  reactions.value = { ...reactions.value, [dayId]: next };
}

// ---------------------------------------------------------------- derived
export const mediaByDay = computed(() => {
  const map = new Map<string, Media[]>();
  for (const m of media.value) {
    const arr = map.get(m.day_id) ?? [];
    arr.push(m);
    map.set(m.day_id, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.sort - b.sort || (a.taken_at ?? "").localeCompare(b.taken_at ?? ""));
  }
  return map;
});

export const dayByNumber = computed(() => new Map(days.value.map((d) => [d.day_number, d])));

export const latestDay = computed<Day | null>(() => days.value[days.value.length - 1] ?? null);

export const latestPosition = computed<Position | null>(() => positions.value[positions.value.length - 1] ?? null);

export const liveState = computed<"live" | "stale" | "none">(() => {
  const p = latestPosition.value;
  if (!p) return "none";
  const age = (clock.value - new Date(p.recorded_at).getTime()) / 60000;
  return age <= LIVE_THRESHOLD_MIN ? "live" : "stale";
});

/** km ranges actually walked (hike days) and transfers. */
export const walked = computed(() => {
  const hike: [number, number][] = [];
  const transfer: [number, number][] = [];
  for (const d of days.value) {
    if (d.start_km === null || d.end_km === null) continue;
    if (Math.abs(d.end_km - d.start_km) < 0.01) continue;
    (d.kind === "transport" ? transfer : hike).push([d.start_km, d.end_km]);
  }
  return { hike: mergeRanges(hike), transfer: mergeRanges(transfer) };
});

/** Where the live position sits on the route (if close enough). */
export const livePlacement = computed(() => {
  const p = latestPosition.value;
  if (!p) return null;
  const snap = route.value.nearest([p.lng, p.lat]);
  return { ...snap, onTrail: snap.dist < 3000 };
});

export const progressKm = computed<number>(() => {
  let km = 0;
  for (const d of days.value) if (d.end_km !== null) km = Math.max(km, d.end_km);
  const lp = livePlacement.value;
  const ld = latestDay.value;
  const pos = latestPosition.value;
  if (lp?.onTrail && pos && (!ld || pos.recorded_at.slice(0, 10) >= ld.date)) km = Math.max(km, lp.km);
  return Math.min(km, route.value.total);
});

export const walkedKm = computed(() => walked.value.hike.reduce((s, [a, b]) => s + (b - a), 0));

export const phase = computed<"before" | "during" | "after">(() => {
  const s = settings.value;
  const today = nzToday(new Date(clock.value));
  if (progressKm.value >= route.value.total - 0.5) return "after";
  if (!days.value.length && s?.start_date && today < s.start_date) return "before";
  if (!days.value.length && !latestPosition.value) return "before";
  return "during";
});

export const dayOnTrail = computed<number | null>(() => {
  const s = settings.value;
  const today = nzToday(new Date(clock.value));
  if (s?.start_date && today >= s.start_date) {
    const end = phase.value === "after" && latestDay.value ? latestDay.value.date : today;
    return daysBetween(s.start_date, end) + 1;
  }
  return latestDay.value?.day_number ?? null;
});

/** Map position of every photo: EXIF GPS, else spread along the day's segment by capture time. */
export const mediaPositions = computed(() => {
  const out = new Map<string, LngLat>();
  const r = route.value;
  for (const d of days.value) {
    const list = mediaByDay.value.get(d.id) ?? [];
    if (!list.length) continue;
    const k0 = d.start_km ?? d.end_km, k1 = d.end_km ?? d.start_km;
    const fallback: LngLat | null =
      d.end_lng !== null && d.end_lat !== null ? [d.end_lng, d.end_lat] : k1 !== null ? r.pointAt(k1) : null;
    const timed = list.filter((m) => m.taken_at).map((m) => new Date(m.taken_at!).getTime());
    const t0 = timed.length ? Math.min(...timed) : 0, t1 = timed.length ? Math.max(...timed) : 0;
    list.forEach((m, i) => {
      if (m.lat !== null && m.lng !== null) { out.set(m.id, [m.lng, m.lat]); return; }
      if (k0 !== null && k1 !== null && Math.abs(k1 - k0) > 0.05) {
        let f = (i + 0.5) / list.length;
        if (m.taken_at && t1 > t0) f = (new Date(m.taken_at).getTime() - t0) / (t1 - t0) * 0.9 + 0.05;
        out.set(m.id, r.pointAt(k0 + (k1 - k0) * f));
      } else if (fallback) {
        out.set(m.id, fallback);
      }
    });
  }
  return out;
});

export function dayTitle(d: Day, l: "fr" | "en"): string {
  const t = l === "en" && d.title_en ? d.title_en : d.title;
  if (t) return t;
  if (d.start_name && d.end_name && d.start_name !== d.end_name) return `${d.start_name} → ${d.end_name}`;
  return d.end_name ?? d.start_name ?? "";
}

export function coverOf(d: Day): Media | null {
  const list = mediaByDay.value.get(d.id) ?? [];
  return list.find((m) => m.id === d.cover_media_id) ?? list.find((m) => m.kind === "photo") ?? list[0] ?? null;
}
