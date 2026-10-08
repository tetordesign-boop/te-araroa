// Offline-first drafts & upload queue. Everything Ewan writes on the trail lands in IndexedDB first,
// then goes out as soon as the phone has signal.
//
// Concurrency rule: the editor saves whole drafts (saveDraft); the sync engine only ever patches
// upload/status fields onto a fresh read of the stored draft (patchStored), so neither overwrites the other.
import { signal } from "@preact/signals";
import { createStore, del, entries, get, set } from "idb-keyval";
import { SUPABASE_KEY, SUPABASE_URL } from "../config";
import type { Day, Media } from "../types";
import { profileFor } from "./elevation";
import { sba } from "./sb";
import { adminRoute, adminSettings } from "./server";

const draftsDb = createStore("ta-admin-drafts", "drafts");
const blobsDb = createStore("ta-admin-blobs", "blobs");
const outboxDb = createStore("ta-admin-outbox", "positions");

export type DraftStatus = "editing" | "queued" | "syncing" | "error" | "done";

export interface DraftMedia {
  id: string;
  kind: "photo" | "video" | "embed";
  mainKey: string | null;
  thumbKey: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  taken_at: string | null;
  lat: number | null;
  lng: number | null;
  caption: string | null;
  embed_url: string | null;
  bytes: number | null;
  path: string | null;
  thumb_path: string | null;
  uploaded: boolean;
  sort: number;
  error?: string | null;
  preparing?: boolean;
}

export type DayFields = Omit<Day, "created_at" | "updated_at">;

export interface Draft extends DayFields {
  media: DraftMedia[];
  removedMedia: { id: string; path: string | null; thumb_path: string | null }[];
  status: DraftStatus;
  error: string | null;
  updatedAt: number;
  /** true until the day row exists on the server */
  isNew: boolean;
  attempts?: number;
  nextTryAt?: number;
}

export const drafts = signal<Draft[]>([]);
export const outbox = signal<number>(0);
export const syncing = signal<{ id: string; label: string; progress: number } | null>(null);
export const online = signal(navigator.onLine);
window.addEventListener("online", () => { online.value = true; kick(true); });
window.addEventListener("offline", () => { online.value = false; });

const sortDrafts = (list: Draft[]) => [...list].sort((a, b) => a.date.localeCompare(b.date));
function publishLocal(d: Draft | null, id: string) {
  const others = drafts.value.filter((x) => x.id !== id);
  drafts.value = sortDrafts(d ? [...others, { ...d }] : others);
}

// ------------------------------------------------------------------ persistence
export async function loadDrafts() {
  const all = (await entries<string, Draft>(draftsDb)).map(([, d]) => d);
  for (const d of all) if (d.status === "syncing") { d.status = "queued"; await set(d.id, d, draftsDb); }
  drafts.value = sortDrafts(all);
  outbox.value = (await entries(outboxDb)).length;
}

export const readStored = (id: string) => get<Draft>(id, draftsDb);

/** Editor writes: whole draft, but never forgets what the sync engine already uploaded. */
export async function saveDraft(d: Draft) {
  const stored = await get<Draft>(d.id, draftsDb);
  if (stored) {
    for (const m of d.media) {
      const s = stored.media.find((x) => x.id === m.id);
      if (s?.uploaded && !m.uploaded) { m.uploaded = true; m.path = s.path; m.thumb_path = s.thumb_path; m.bytes = s.bytes; }
    }
    if (stored.isNew === false) d.isNew = false;
  }
  d.updatedAt = Date.now();
  await set(d.id, d, draftsDb);
  publishLocal(d, d.id);
}

/** Sync-engine writes: patch a fresh copy, keep updatedAt (so user edits stay detectable). */
async function patchStored(id: string, fn: (d: Draft) => void): Promise<Draft | undefined> {
  const cur = await get<Draft>(id, draftsDb);
  if (!cur) return undefined;
  fn(cur);
  await set(id, cur, draftsDb);
  publishLocal(cur, id);
  return cur;
}

async function deleteBlobs(m: Pick<DraftMedia, "mainKey" | "thumbKey">) {
  if (m.mainKey) await del(m.mainKey, blobsDb);
  if (m.thumbKey) await del(m.thumbKey, blobsDb);
}
export const dropMediaBlobs = deleteBlobs;

export async function dropDraft(id: string) {
  const d = await get<Draft>(id, draftsDb) ?? drafts.value.find((x) => x.id === id);
  if (d) for (const m of d.media) await deleteBlobs(m);
  await del(id, draftsDb);
  publishLocal(null, id);
}

export const putBlob = (key: string, b: Blob) => set(key, b, blobsDb);
export const getBlob = (key: string) => get<Blob>(key, blobsDb);

// ------------------------------------------------------------------ positions outbox
export async function queuePosition(p: { recorded_at: string; lat: number; lng: number; acc: number | null; note: string | null }) {
  await set(p.recorded_at, p, outboxDb);
  outbox.value = (await entries(outboxDb)).length;
  kick(true);
}

async function flushPositions() {
  const items = await entries<string, { recorded_at: string; lat: number; lng: number; acc: number | null; note: string | null }>(outboxDb);
  if (!items.length) return;
  const rows = items.map(([, p]) => ({ ...p, source: "checkin" }));
  const { error } = await sba.from("positions").upsert(rows, { onConflict: "source,recorded_at", ignoreDuplicates: true });
  if (error) throw error;
  for (const [k] of items) await del(k, outboxDb);
  outbox.value = (await entries(outboxDb)).length;
}

// ------------------------------------------------------------------ errors
class PermanentError extends Error {}

function statusOf(e: unknown): number | null {
  const x = e as { status?: number; statusCode?: string | number; originalResponse?: { getStatus?: () => number } };
  const s = x?.originalResponse?.getStatus?.() ?? x?.status ?? (x?.statusCode !== undefined ? Number(x.statusCode) : null);
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof PermanentError) return false;
  const s = statusOf(e);
  if (s !== null && s >= 400 && s < 500 && s !== 408 && s !== 429) return false;
  if (e instanceof TypeError) return true;
  const err = e as { name?: string; message?: string; originalError?: unknown };
  if (err?.originalError instanceof TypeError) return true;
  const msg = `${err?.name ?? ""} ${err?.message ?? ""}`;
  if (/failed to fetch|load failed|network|timed? ?out|offline|aborted|ECONN/i.test(msg)) return true;
  return !navigator.onLine;
}

function friendly(e: unknown): string {
  const s = statusOf(e);
  const msg = (e as Error)?.message ?? String(e);
  if (s === 413 || /exceeded|too large|payload/i.test(msg)) return "Fichier trop lourd ou stockage plein (1 Go). Retire une vidéo ou libère de la place.";
  if (s === 401 || s === 403 || /jwt|unauthor|permission|row-level/i.test(msg)) return "Session expirée : reconnecte-toi (Réglages › Se déconnecter puis reconnexion).";
  return msg.slice(0, 160);
}

// ------------------------------------------------------------------ uploads
async function uploadSmall(path: string, blob: Blob, type: string) {
  const { error } = await sba.storage.from("media").upload(path, blob, { upsert: true, contentType: type, cacheControl: "31536000" });
  if (error) throw error;
}

async function uploadResumable(path: string, blob: Blob, type: string, onProgress: (f: number) => void) {
  const { Upload } = await import("tus-js-client");
  const { data } = await sba.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new TypeError("no session yet (offline?)");
  await new Promise<void>((resolve, reject) => {
    const up = new Upload(blob, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, "x-upsert": "true" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: "media", objectName: path, contentType: type, cacheControl: "31536000" },
      onError: (e) => reject(e),
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });
    up.findPreviousUploads().then((prev) => {
      if (prev.length) up.resumeFromPreviousUpload(prev[0]);
      up.start();
    }).catch(reject);
  });
}

function dayRow(d: Draft) {
  const {
    media: _m, removedMedia: _r, status: _s, error: _e, updatedAt: _u, isNew: _n, attempts: _a, nextTryAt: _t, ...row
  } = d;
  return { ...row, cover_media_id: null as string | null };
}

const usable = (m: DraftMedia) => !m.error && !m.preparing;

async function syncDraft(id: string) {
  let d = await patchStored(id, (x) => { x.status = "syncing"; x.error = null; });
  if (!d) return;
  const startedAt = d.updatedAt;
  const wasNew = d.isNew;
  const label = `Jour ${d.day_number}`;

  // 1. files (each one is marked as sent as soon as it is, so nothing is uploaded twice)
  const todo = d.media.filter((m) => m.kind !== "embed" && !m.uploaded && usable(m)).map((m) => m.id);
  for (let i = 0; i < todo.length; i++) {
    const latest = await readStored(id);
    if (!latest) return; // deleted meanwhile
    const m = latest.media.find((x) => x.id === todo[i]);
    if (!m || m.uploaded || !usable(m)) continue;
    syncing.value = { id, label, progress: i / todo.length };
    const ext = m.kind !== "video" ? "jpg" : m.mime?.includes("quicktime") ? "mov" : m.mime?.includes("webm") ? "webm" : "mp4";
    const path = m.path ?? `d/${id}/${m.id}.${ext}`;
    const thumbPath = m.thumb_path ?? `d/${id}/${m.id}_t.jpg`;
    const main = m.mainKey ? await getBlob(m.mainKey) : null;
    const thumb = m.thumbKey ? await getBlob(m.thumbKey) : null;
    if (!main || !thumb) {
      await patchStored(id, (x) => { const t = x.media.find((y) => y.id === m.id); if (t) t.error = "Fichier perdu sur le téléphone, retire-le"; });
      continue;
    }
    await uploadSmall(thumbPath, thumb, "image/jpeg");
    if (m.kind === "video" || main.size > 6 * 1024 * 1024) {
      await uploadResumable(path, main, m.mime ?? (m.kind === "video" ? "video/mp4" : "image/jpeg"), (f) => {
        syncing.value = { id, label, progress: (i + f) / todo.length };
      });
    } else {
      await uploadSmall(path, main, "image/jpeg");
    }
    await patchStored(id, (x) => {
      const t = x.media.find((y) => y.id === m.id);
      if (t) { t.uploaded = true; t.path = path; t.thumb_path = thumbPath; t.bytes = main.size + thumb.size; t.error = null; }
    });
  }

  // 2. work from a fresh copy for the server writes
  d = await readStored(id);
  if (!d) return;
  if (d.status !== "syncing") return; // edited again (or re-queued) meanwhile: wait for the next "Publier"

  // elevation (best effort, needs network)
  if (d.kind === "hike" && d.start_km !== null && d.end_km !== null && (!d.track || d.ascent_m === null)) {
    try {
      const prof = await profileFor(adminRoute.value, d.start_km, d.end_km, adminSettings.value?.linz_api_key);
      if (prof) {
        d = (await patchStored(id, (x) => {
          x.track = { p: prof.p };
          if (x.ascent_m === null) x.ascent_m = prof.up;
          if (x.descent_m === null) x.descent_m = prof.down;
        })) ?? d;
      }
    } catch (_) { /* not critical */ }
  }

  const { error: e1 } = await sba.from("days").upsert(dayRow(d), { onConflict: "id" });
  if (e1) {
    if (e1.message.includes("days_date_key")) throw new PermanentError("Une autre étape existe déjà à cette date : change la date.");
    throw e1;
  }
  d = (await patchStored(id, (x) => { x.isNew = false; })) ?? d;

  const ready = d.media.filter((m) => usable(m) && (m.kind === "embed" || m.uploaded));
  if (ready.length) {
    const rows: Partial<Media>[] = ready.map((m, i) => ({
      id: m.id, day_id: id, kind: m.kind, path: m.kind === "embed" ? null : m.path, thumb_path: m.kind === "embed" ? null : m.thumb_path,
      embed_url: m.embed_url, width: m.width, height: m.height, duration_s: m.duration_s, taken_at: m.taken_at,
      lat: m.lat, lng: m.lng, caption: m.caption, sort: i, bytes: m.bytes,
    } as Partial<Media>));
    const { error: e2 } = await sba.from("media").upsert(rows, { onConflict: "id" });
    if (e2) throw e2;
    const pos = ready.filter((m) => m.lat !== null && m.lng !== null && m.taken_at)
      .map((m) => ({ recorded_at: m.taken_at, lat: m.lat, lng: m.lng, source: "photo" }));
    if (pos.length) await sba.from("positions").upsert(pos, { onConflict: "source,recorded_at", ignoreDuplicates: true });
  }

  if (d.removedMedia.length) {
    const removed = d.removedMedia;
    const { error: e3 } = await sba.from("media").delete().in("id", removed.map((r) => r.id));
    if (e3) throw e3;
    const paths = removed.flatMap((r) => [r.path, r.thumb_path]).filter(Boolean) as string[];
    if (paths.length) {
      const { error: e4 } = await sba.storage.from("media").remove(paths);
      if (e4) throw e4;
    }
    d = (await patchStored(id, (x) => { x.removedMedia = x.removedMedia.filter((r) => !removed.some((y) => y.id === r.id)); })) ?? d;
  }

  const cover = d.cover_media_id && ready.some((m) => m.id === d!.cover_media_id)
    ? d.cover_media_id : ready.find((m) => m.kind === "photo")?.id ?? null;
  const { error: e5 } = await sba.from("days").update({ cover_media_id: cover }).eq("id", id);
  if (e5) throw e5;

  // 3. done?
  const final = await readStored(id);
  if (!final) {
    // a brand-new day deleted on the phone while it was being published: take it back down
    if (wasNew) await sba.from("days").delete().eq("id", id);
    return;
  }
  const stillToSend = final.media.some((m) => m.kind !== "embed" && usable(m) && !m.uploaded);
  if (stillToSend) {
    await patchStored(id, (x) => { if (x.status === "syncing") { x.status = "queued"; } });
    return;
  }
  if (final.updatedAt !== startedAt || final.status !== "syncing") return; // changed meanwhile: keep it
  await dropDraft(id);
}

let running = false;
export async function syncAll(force = false): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    try { await flushPositions(); } catch (e) { console.warn("positions", e); }
    const now = Date.now();
    const due = drafts.value.filter((x) => (x.status === "queued" || x.status === "error") && (force || !x.nextTryAt || x.nextTryAt <= now));
    for (const d of due) {
      try {
        await syncDraft(d.id);
      } catch (e) {
        const net = isNetworkError(e);
        await patchStored(d.id, (x) => {
          x.attempts = (x.attempts ?? 0) + 1;
          const base = net ? 20_000 : 60_000;
          x.nextTryAt = Date.now() + Math.min(net ? 5 * 60_000 : 60 * 60_000, base * 2 ** Math.min(6, x.attempts - 1));
          if (x.status === "syncing") {
            x.status = net ? "queued" : "error";
            x.error = net ? null : friendly(e);
          }
        });
      }
    }
  } finally {
    running = false;
    syncing.value = null;
    onSynced.forEach((f) => f());
  }
}

const onSynced = new Set<() => void>();
export function afterSync(f: () => void) { onSynced.add(f); return () => onSynced.delete(f); }

export function kick(force = false) { window.setTimeout(() => syncAll(force), 300); }

export function startSyncLoop() {
  kick(true);
  window.setInterval(() => {
    const pending = outbox.value > 0 || drafts.value.some((d) => d.status === "queued" || d.status === "error");
    if (pending && navigator.onLine && document.visibilityState === "visible") syncAll();
  }, 15_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(true); });
}
