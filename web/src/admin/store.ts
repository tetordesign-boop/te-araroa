// Offline-first drafts & upload queue. Everything Ewan writes on the trail lands in IndexedDB first,
// then goes out as soon as the phone has signal.
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
  progress?: number;
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
  isNew: boolean;
}

export const drafts = signal<Draft[]>([]);
export const outbox = signal<number>(0);
export const syncing = signal<{ id: string; label: string; progress: number } | null>(null);
export const online = signal(navigator.onLine);
window.addEventListener("online", () => { online.value = true; kick(); });
window.addEventListener("offline", () => { online.value = false; });

// ------------------------------------------------------------------ persistence
export async function loadDrafts() {
  const all = (await entries<string, Draft>(draftsDb)).map(([, d]) => d);
  // a sync interrupted by closing the app is simply retried
  for (const d of all) if (d.status === "syncing") d.status = "queued";
  drafts.value = all.sort((a, b) => a.date.localeCompare(b.date));
  outbox.value = (await entries(outboxDb)).length;
}

export async function saveDraft(d: Draft) {
  d.updatedAt = Date.now();
  await set(d.id, d, draftsDb);
  const others = drafts.value.filter((x) => x.id !== d.id);
  drafts.value = [...others, { ...d }].sort((a, b) => a.date.localeCompare(b.date));
}

export async function dropDraft(id: string) {
  const d = drafts.value.find((x) => x.id === id) ?? (await get<Draft>(id, draftsDb));
  if (d) for (const m of d.media) { if (m.mainKey) await del(m.mainKey, blobsDb); if (m.thumbKey) await del(m.thumbKey, blobsDb); }
  await del(id, draftsDb);
  drafts.value = drafts.value.filter((x) => x.id !== id);
}

export const putBlob = (key: string, b: Blob) => set(key, b, blobsDb);
export const getBlob = (key: string) => get<Blob>(key, blobsDb);

// ------------------------------------------------------------------ positions outbox
export async function queuePosition(p: { recorded_at: string; lat: number; lng: number; acc: number | null; note: string | null }) {
  await set(p.recorded_at, p, outboxDb);
  outbox.value = (await entries(outboxDb)).length;
  kick();
}

async function flushPositions() {
  const items = await entries<string, { recorded_at: string; lat: number; lng: number; acc: number | null; note: string | null }>(outboxDb);
  if (!items.length) return;
  const rows = items.map(([, p]) => ({ ...p, source: "checkin" }));
  const { error } = await sba.from("positions").upsert(rows, { onConflict: "source,recorded_at", ignoreDuplicates: true });
  if (error) throw error;
  for (const [k] of items) await del(k, outboxDb);
  outbox.value = 0;
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
  if (!token) throw new Error("Session expirée : reconnecte-toi.");
  await new Promise<void>((resolve, reject) => {
    const up = new Upload(blob, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
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
    });
  });
}

function dayRow(d: Draft, withCover: boolean) {
  const { media: _m, removedMedia: _r, status: _s, error: _e, updatedAt: _u, isNew: _n, ...row } = d;
  return { ...row, cover_media_id: withCover ? d.cover_media_id : null };
}

async function syncDraft(d: Draft) {
  d.status = "syncing"; d.error = null;
  await saveDraft(d);
  const startedAt = d.updatedAt;
  const label = `Jour ${d.day_number}`;
  const items = d.media.filter((m) => m.kind !== "embed" && !m.uploaded && !m.preparing);
  let doneCount = 0;
  for (const m of items) {
    syncing.value = { id: d.id, label, progress: doneCount / Math.max(1, items.length) };
    const ext = m.kind === "video" ? "mp4" : "jpg";
    m.path = m.path ?? `d/${d.id}/${m.id}.${ext}`;
    m.thumb_path = m.thumb_path ?? `d/${d.id}/${m.id}_t.jpg`;
    const main = m.mainKey ? await getBlob(m.mainKey) : null;
    const thumb = m.thumbKey ? await getBlob(m.thumbKey) : null;
    if (!main || !thumb) { m.error = "Fichier introuvable sur le téléphone"; continue; }
    if (thumb) await uploadSmall(m.thumb_path, thumb, "image/jpeg");
    if (m.kind === "video" || main.size > 6 * 1024 * 1024) {
      await uploadResumable(m.path, main, m.mime ?? (m.kind === "video" ? "video/mp4" : "image/jpeg"), (f) => {
        m.progress = f;
        syncing.value = { id: d.id, label, progress: (doneCount + f) / Math.max(1, items.length) };
      });
    } else {
      await uploadSmall(m.path, main, "image/jpeg");
    }
    m.uploaded = true; m.progress = 1; m.bytes = main.size + thumb.size; m.error = null;
    doneCount++;
    await saveDraft(d);
  }

  // elevation (best effort, needs network)
  if (d.kind === "hike" && d.start_km !== null && d.end_km !== null && (!d.track || d.ascent_m === null)) {
    try {
      const prof = await profileFor(adminRoute.value, d.start_km, d.end_km, adminSettings.value?.linz_api_key);
      if (prof) {
        d.track = { p: prof.p };
        if (d.ascent_m === null) d.ascent_m = prof.up;
        if (d.descent_m === null) d.descent_m = prof.down;
      }
    } catch (_) { /* not critical */ }
  }

  const { error: e1 } = await sba.from("days").upsert(dayRow(d, false), { onConflict: "id" });
  if (e1) throw new Error(e1.message.includes("days_date_key") ? "Une autre étape existe déjà à cette date." : e1.message);

  const ready = d.media.filter((m) => m.kind === "embed" || m.uploaded);
  if (ready.length) {
    const rows: Partial<Media>[] = ready.map((m, i) => ({
      id: m.id, day_id: d.id, kind: m.kind, path: m.kind === "embed" ? null : m.path, thumb_path: m.kind === "embed" ? null : m.thumb_path,
      embed_url: m.embed_url, width: m.width, height: m.height, duration_s: m.duration_s, taken_at: m.taken_at,
      lat: m.lat, lng: m.lng, caption: m.caption, sort: i, bytes: m.bytes,
    } as Partial<Media>));
    const { error: e2 } = await sba.from("media").upsert(rows, { onConflict: "id" });
    if (e2) throw e2;
    // photo locations double as position history
    const pos = ready.filter((m) => m.lat !== null && m.lng !== null && m.taken_at)
      .map((m) => ({ recorded_at: m.taken_at, lat: m.lat, lng: m.lng, source: "photo" }));
    if (pos.length) await sba.from("positions").upsert(pos, { onConflict: "source,recorded_at", ignoreDuplicates: true });
  }
  if (d.removedMedia.length) {
    const ids = d.removedMedia.map((r) => r.id);
    await sba.from("media").delete().in("id", ids);
    const paths = d.removedMedia.flatMap((r) => [r.path, r.thumb_path]).filter(Boolean) as string[];
    if (paths.length) await sba.storage.from("media").remove(paths);
  }
  const cover = d.cover_media_id && ready.some((m) => m.id === d.cover_media_id) ? d.cover_media_id : ready.find((m) => m.kind === "photo")?.id ?? null;
  const { error: e3 } = await sba.from("days").update({ cover_media_id: cover }).eq("id", d.id);
  if (e3) throw e3;

  const pending = d.media.some((m) => m.kind !== "embed" && !m.uploaded);
  if (pending) { d.status = "error"; d.error = "Certains fichiers n'ont pas pu être envoyés."; await saveDraft(d); return; }
  // edited again while uploading? keep the newer version as a draft (already-sent files stay sent)
  const latest = await get<Draft>(d.id, draftsDb);
  if (latest && latest.status === "editing" && latest.updatedAt > startedAt) {
    for (const m of latest.media) {
      const sent = d.media.find((x) => x.id === m.id);
      if (sent?.uploaded) { m.uploaded = true; m.path = sent.path; m.thumb_path = sent.thumb_path; m.bytes = sent.bytes; }
    }
    latest.isNew = false;
    await set(latest.id, latest, draftsDb);
    drafts.value = drafts.value.map((x) => (x.id === latest.id ? latest : x));
    return;
  }
  d.status = "done";
  await dropDraft(d.id);
}

function isNetworkError(e: unknown): boolean {
  const err = e as { name?: string; message?: string; originalError?: unknown; status?: number };
  if (e instanceof TypeError) return true;
  const msg = `${err?.name ?? ""} ${err?.message ?? ""}`;
  if (/failed to fetch|load failed|network|timed? ?out|offline|aborted|ECONN|tus: failed to upload/i.test(msg)) return true;
  if (err?.originalError instanceof TypeError) return true;
  return !navigator.onLine;
}

let running = false;
export async function syncAll(): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    try { await flushPositions(); } catch (e) { console.warn("positions", e); }
    for (const d of drafts.value.filter((x) => x.status === "queued" || x.status === "error")) {
      try {
        await syncDraft(d);
      } catch (e) {
        if (isNetworkError(e)) {
          // weak or no signal: not a real failure, it will simply be retried
          d.status = "queued";
          d.error = null;
        } else {
          d.status = "error";
          d.error = (e as Error)?.message || "Échec de l'envoi";
        }
        await saveDraft(d);
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

export function kick() { window.setTimeout(() => syncAll(), 300); }

export function startSyncLoop() {
  kick();
  window.setInterval(() => {
    const pending = outbox.value > 0 || drafts.value.some((d) => d.status === "queued" || d.status === "error");
    if (pending && navigator.onLine && document.visibilityState === "visible") syncAll();
  }, 20_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(); });
}
