import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { mediaUrl } from "../config";
import { daysBetween, fmtKm, nzToday } from "../lib/format";
import type { Day, DayKind } from "../types";
import { ChevronLeft, Close, Locate, MapIcon, Play, Star } from "../ui/icons";
import { Seg } from "../ui/Seg";
import { shortPlace } from "../ui/TrailStrip";
import { profileFor } from "./elevation";
import { MapPicker, type Pick } from "./MapPicker";
import { home, say } from "./nav";
import { prepareVideo, preparePhoto } from "./media";
import { adminDays, adminMedia, adminRoute, adminSettings, loadServer } from "./server";
import { dropDraft, dropMediaBlobs, drafts, getBlob, kick, online, putBlob, saveDraft, type Draft, type DraftMedia } from "./store";
import { sba } from "./sb";

const WEATHER = ["☀️", "🌤️", "⛅", "☁️", "🌧️", "⛈️", "🌨️", "🌬️", "🌫️"];
const MOODS = ["😄", "😊", "😌", "😐", "😩", "🥵", "🥶", "😴", "🤕"];

/** Drafts opened from a published day live here until the first change (nothing is stored for a mere look). */
export const memDrafts = new Map<string, Draft>();

// ------------------------------------------------------------------ draft factory
export function dayNumberFor(date: string): number {
  const s = adminSettings.value?.start_date;
  if (s && date >= s) return daysBetween(s, date) + 1;
  const before = adminDays.value.filter((d) => d.date < date);
  return (before.length ? Math.max(...before.map((d) => d.day_number)) : 0) + 1;
}

function previousEnd(date: string, exceptId?: string) {
  const all = [...adminDays.value, ...drafts.value].filter((d) => d.date < date && d.id !== exceptId && d.end_km !== null);
  all.sort((a, b) => a.date.localeCompare(b.date));
  const last = all[all.length - 1];
  if (!last) return { km: 0, name: "Ship Cove", point: adminRoute.value.pointAt(0) };
  return {
    km: last.end_km!, name: last.end_name ?? null,
    point: (last.end_lng !== null && last.end_lat !== null ? [last.end_lng, last.end_lat] : adminRoute.value.pointAt(last.end_km!)) as [number, number],
  };
}

export function newDraft(date = nzToday()): Draft {
  const prev = previousEnd(date);
  return {
    id: crypto.randomUUID(), date, day_number: dayNumberFor(date), kind: "hike",
    title: null, title_en: null, story: null, story_en: null,
    start_km: prev.km, end_km: null, start_lng: prev.point[0], start_lat: prev.point[1], end_lng: null, end_lat: null,
    start_name: prev.name, end_name: null, distance_km: null, ascent_m: null, descent_m: null, moving_time_min: null,
    weather: null, mood: null, cover_media_id: null, track: null, published: true,
    media: [], removedMedia: [], status: "editing", error: null, updatedAt: Date.now(), isNew: true,
  };
}

export function draftFromDay(d: Day): Draft {
  const media = adminMedia.value.filter((m) => m.day_id === d.id).sort((a, b) => a.sort - b.sort);
  const { created_at: _c, updated_at: _u, ...fields } = d;
  return {
    ...fields,
    media: media.map((m, i): DraftMedia => ({
      id: m.id, kind: m.kind, mainKey: null, thumbKey: null, mime: null, width: m.width, height: m.height,
      duration_s: m.duration_s, taken_at: m.taken_at, lat: m.lat, lng: m.lng, caption: m.caption, embed_url: m.embed_url,
      bytes: (m as unknown as { bytes?: number }).bytes ?? null, path: m.path, thumb_path: m.thumb_path, uploaded: true, sort: i,
    })),
    removedMedia: [], status: "editing", error: null, updatedAt: Date.now(), isNew: false,
  };
}

/** Today's draft, today's published day, or a fresh draft. Nothing is stored until Ewan changes something. */
export function draftForToday(): Draft {
  const today = nzToday();
  const existingDraft = drafts.value.find((d) => d.date === today);
  if (existingDraft) return existingDraft;
  const published = adminDays.value.find((d) => d.date === today);
  return published ? draftFromDay(published) : newDraft(today);
}

/** Open a draft in the editor (keeps it in memory only if it is not on the phone yet). */
export function openDraft(d: Draft, open: (id: string) => void) {
  if (!drafts.value.some((x) => x.id === d.id)) memDrafts.set(d.id, d);
  open(d.id);
}

// ------------------------------------------------------------------ small pieces
function useBlobUrl(key: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key) { setUrl(null); return; }
    let u: string | null = null, alive = true;
    getBlob(key).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [key]);
  return url;
}

function MediaTile({ m, cover, progress, onCover, onRemove }: { m: DraftMedia; cover: boolean; progress?: number; onCover: () => void; onRemove: () => void }) {
  const local = useBlobUrl(m.thumbKey);
  const src = local ?? (m.thumb_path ? mediaUrl(m.thumb_path) : null);
  const state = m.preparing ? (progress ? `Compression ${Math.round(progress * 100)} %` : "Préparation…") : m.error ? null : !m.uploaded && m.kind !== "embed" ? "À envoyer" : null;
  return (
    <div class="mitem">
      {src ? <img src={src} alt="" /> : <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: "26px" }}>{m.kind === "embed" ? <Play class="mitem__ph" /> : <span class="spin" aria-hidden="true" />}</div>}
      {m.kind !== "photo" && <span class="mitem__badge">{m.kind === "embed" ? "Lien" : m.duration_s ? `${Math.round(m.duration_s)} s` : "Vidéo"}</span>}
      {m.kind === "photo" && !m.error && <button type="button" class="mitem__star" aria-pressed={cover} aria-label="Photo de couverture" onClick={onCover}><Star /></button>}
      <button type="button" class="mitem__del" aria-label="Retirer" onClick={onRemove}><Close /></button>
      {state && <span class="mitem__badge" style={{ top: "auto", bottom: "6px" }}>{state}</span>}
      {m.error && <div class="mitem__err">{m.error}</div>}
    </div>
  );
}

/** Number input that keeps what is typed ("12," stays "12,") and commits on blur. */
function NumField({ value, onCommit, decimals, placeholder }: { value: number | null; onCommit: (v: number | null) => void; decimals: boolean; placeholder?: string }) {
  const show = (v: number | null) => (v === null || v === undefined ? "" : decimals ? String(Math.round(v * 10) / 10).replace(".", ",") : String(Math.round(v)));
  const [raw, setRaw] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setRaw(show(value)); }, [value]);
  const commit = () => {
    focused.current = false;
    const v = decimals ? parseFloat(raw.replace(",", ".")) : parseInt(raw, 10);
    const n = Number.isFinite(v) ? v : null;
    onCommit(n);
    setRaw(show(n));
  };
  return (
    <input inputMode={decimals ? "decimal" : "numeric"} value={raw} placeholder={placeholder}
      onFocus={() => { focused.current = true; }} onInput={(e) => setRaw((e.target as HTMLInputElement).value)} onBlur={commit} />
  );
}

// ------------------------------------------------------------------ editor
export function Editor({ id }: { id: string }) {
  const route = adminRoute.value;
  const initial = drafts.value.find((x) => x.id === id) ?? memDrafts.get(id) ?? null;
  const dRef = useRef<Draft | null>(initial);
  const [d, setD] = useState<Draft | null>(initial);
  const closed = useRef(false);
  const dirty = useRef(false);
  const saveTimer = useRef<number>();
  const [picking, setPicking] = useState<null | "end" | "start">(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [showEn, setShowEn] = useState(false);
  const [link, setLink] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // flush a pending save when leaving the screen
  useEffect(() => () => {
    if (!closed.current && dirty.current && dRef.current) { clearTimeout(saveTimer.current); saveDraft(dRef.current); }
    memDrafts.delete(id);
  }, []);

  // Stay in step with the sync engine while this screen is open: files already sent, status, and
  // once the day is safely online (the draft leaves the phone) go back to the list.
  const stored = drafts.value.find((x) => x.id === id) ?? null;
  const wasStored = useRef(false);
  useEffect(() => {
    const cur = dRef.current;
    if (!cur || closed.current) return;
    if (!stored) {
      if (wasStored.current && cur.status !== "editing") {
        closed.current = true;
        say(`Jour ${cur.day_number} publié.`);
        home();
      }
      return;
    }
    wasStored.current = true;
    let changed = false;
    const media = cur.media.map((m) => {
      const s = stored.media.find((x) => x.id === m.id);
      if (s?.uploaded && !m.uploaded) { changed = true; return { ...m, uploaded: true, path: s.path, thumb_path: s.thumb_path, bytes: s.bytes }; }
      if (s?.error && !m.error) { changed = true; return { ...m, error: s.error }; }
      return m;
    });
    const next: Draft = { ...cur, media };
    if (stored.isNew === false && cur.isNew) { next.isNew = false; changed = true; }
    // Ewan's own edits win; otherwise mirror what the sync engine reports
    if (cur.status !== "editing" && (stored.status !== cur.status || stored.error !== cur.error)) {
      next.status = stored.status; next.error = stored.error; changed = true;
    }
    if (changed) { dRef.current = next; setD(next); }
  }, [stored]);

  const commit = (next: Draft, immediate = false) => {
    if (closed.current) return;
    dRef.current = next;
    dirty.current = true;
    setD(next);
    clearTimeout(saveTimer.current);
    if (immediate) saveDraft(next);
    else saveTimer.current = window.setTimeout(() => { if (!closed.current && dRef.current) saveDraft(dRef.current); }, 350);
  };
  /** Every change by Ewan turns the draft back into "editing" (it goes out again on the next "Publier"). */
  const update = (patch: Partial<Draft>, immediate = false) => {
    const cur = dRef.current;
    if (!cur) return;
    commit({ ...cur, ...patch, status: "editing", error: null }, immediate);
  };
  const patchMedia = (mid: string, fn: (m: DraftMedia) => DraftMedia) => {
    const cur = dRef.current;
    if (!cur) return;
    commit({ ...cur, media: cur.media.map((m) => (m.id === mid ? fn({ ...m }) : m)) }, true);
  };

  const recomputeElevation = async (k0: number | null, k1: number | null) => {
    if (!navigator.onLine || k0 === null || k1 === null || k1 - k0 < 0.2 || dRef.current?.kind !== "hike") return;
    const prof = await profileFor(route, k0, k1, adminSettings.value?.linz_api_key).catch(() => null);
    const cur = dRef.current;
    if (!prof || !cur || closed.current || cur.start_km !== k0 || cur.end_km !== k1) return;
    commit({ ...cur, track: { p: prof.p }, ascent_m: prof.up, descent_m: prof.down }, true);
  };

  const setEnd = (km: number, point: [number, number]) => {
    const cur = dRef.current;
    if (!cur) return;
    const start = cur.start_km ?? 0;
    const near = route.places().reduce((b, p) => (Math.abs(p.km - km) < Math.abs(b.km - km) ? p : b));
    const name = Math.abs(near.km - km) < 2.5 ? shortPlace(near.n) : cur.end_name;
    const dist = Math.max(0, Math.round((km - start) * 10) / 10);
    update({ end_km: km, end_lng: point[0], end_lat: point[1], end_name: name ?? null, distance_km: dist, track: null, ascent_m: null, descent_m: null }, true);
    recomputeElevation(start, km);
  };

  const setStart = (p: Pick) => {
    const cur = dRef.current;
    if (!cur) return;
    update({
      start_km: p.km, start_lng: p.lng, start_lat: p.lat,
      distance_km: cur.end_km !== null ? Math.max(0, Math.round((cur.end_km - p.km) * 10) / 10) : cur.distance_km,
      track: null, ascent_m: null, descent_m: null,
    }, true);
    recomputeElevation(p.km, cur.end_km);
  };

  const useGps = () => {
    if (!("geolocation" in navigator)) { setGpsMsg("La localisation n'est pas disponible sur cet appareil."); return; }
    setGpsBusy(true); setGpsMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        const s = route.nearest([pos.coords.longitude, pos.coords.latitude]);
        if (s.dist > 5000) setGpsMsg(`Tu es à ${fmtKm(s.dist / 1000, "fr", 1)} km du sentier : l'arrivée est placée sur le point du sentier le plus proche.`);
        setEnd(s.km, s.dist < 400 ? [pos.coords.longitude, pos.coords.latitude] : s.point);
      },
      (err) => {
        setGpsBusy(false);
        setGpsMsg(err.code === 1 ? "Autorise la localisation pour ce site dans Réglages › Safari › Localisation." : "Position introuvable. Réessaie à découvert ou choisis sur la carte.");
      },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 120000 },
    );
  };

  const photoGps = useMemo(() => {
    const withGps = (d?.media ?? []).filter((m) => m.lat !== null && m.lng !== null && m.taken_at).sort((a, b) => (a.taken_at! < b.taken_at! ? 1 : -1));
    return withGps[0] ?? null;
  }, [d?.media]);

  const addFiles = async (files: FileList | null) => {
    if (!files || !dRef.current) return;
    const list = Array.from(files);
    if (fileRef.current) fileRef.current.value = "";
    for (const file of list) {
      const isVideo = file.type.startsWith("video/");
      const mid = crypto.randomUUID();
      const cur = dRef.current;
      if (!cur) return;
      const m: DraftMedia = {
        id: mid, kind: isVideo ? "video" : "photo", mainKey: null, thumbKey: null, mime: isVideo ? "video/mp4" : "image/jpeg",
        width: null, height: null, duration_s: null, taken_at: null, lat: null, lng: null, caption: null, embed_url: null,
        bytes: null, path: null, thumb_path: null, uploaded: false, sort: cur.media.length, preparing: true,
      };
      update({ media: [...cur.media, m] }, true);
      try {
        const p = isVideo
          ? await prepareVideo(file, (f) => setProgress((x) => ({ ...x, [mid]: f })))
          : await preparePhoto(file);
        const mainKey = `${mid}:main`, thumbKey = `${mid}:thumb`;
        await putBlob(mainKey, p.main);
        await putBlob(thumbKey, p.thumb);
        patchMedia(mid, (x) => ({
          ...x, mainKey, thumbKey, width: p.width, height: p.height, duration_s: p.duration, taken_at: p.takenAt, lat: p.lat, lng: p.lng,
          bytes: p.main.size + p.thumb.size, preparing: false, error: null, mime: p.kind === "video" ? p.main.type || "video/mp4" : "image/jpeg",
        }));
        const now = dRef.current;
        if (now && !now.cover_media_id && p.kind === "photo") commit({ ...now, cover_media_id: mid }, true);
      } catch (e) {
        patchMedia(mid, (x) => ({ ...x, preparing: false, error: (e as Error).message?.slice(0, 140) || "Fichier illisible" }));
      }
    }
  };

  const addLink = () => {
    const cur = dRef.current;
    if (!cur || !/^https:\/\//.test(link.trim())) { say("Colle un lien qui commence par https://"); return; }
    const m: DraftMedia = {
      id: crypto.randomUUID(), kind: "embed", mainKey: null, thumbKey: null, mime: null, width: null, height: null, duration_s: null,
      taken_at: null, lat: null, lng: null, caption: null, embed_url: link.trim(), bytes: null, path: null, thumb_path: null, uploaded: true, sort: cur.media.length,
    };
    update({ media: [...cur.media, m] }, true);
    setLink("");
  };

  const removeMedia = (m: DraftMedia) => {
    const cur = dRef.current;
    if (!cur) return;
    // anything already sent (or a link that may already be live) must also be removed from the server
    const maybeOnServer = m.uploaded && (!!m.path || m.kind === "embed");
    update({
      media: cur.media.filter((x) => x.id !== m.id),
      removedMedia: maybeOnServer ? [...cur.removedMedia, { id: m.id, path: m.path, thumb_path: m.thumb_path }] : cur.removedMedia,
      cover_media_id: cur.cover_media_id === m.id ? null : cur.cover_media_id,
    }, true);
    dropMediaBlobs(m).catch(() => {});
  };

  const publish = async () => {
    const cur = dRef.current;
    if (!cur) return;
    if (cur.kind !== "rest" && cur.end_km === null) { say("Indique d'abord ton point d'arrivée."); return; }
    if (cur.media.some((m) => m.preparing)) { say("Attends la fin de la préparation des photos."); return; }
    if (cur.media.some((m) => m.error)) { say("Retire d'abord les fichiers en erreur (en rouge)."); return; }
    const end = cur.kind === "rest"
      ? { end_km: cur.start_km, end_lng: cur.start_lng, end_lat: cur.start_lat, end_name: cur.end_name ?? cur.start_name, distance_km: 0 } : {};
    clearTimeout(saveTimer.current);
    closed.current = true;
    await saveDraft({ ...cur, ...end, status: "queued", error: null, attempts: 0, nextTryAt: 0 });
    kick(true);
    say(online.value ? "Publication en cours…" : "Enregistré. Publication dès que tu as du réseau.");
    home();
  };

  const discard = async () => {
    const cur = dRef.current;
    if (!cur) return;
    if (dirty.current && !confirm("Annuler tes modifications ? La version en ligne ne change pas.")) return;
    clearTimeout(saveTimer.current);
    closed.current = true;
    await dropDraft(cur.id);
    home();
  };

  const remove = async () => {
    const cur = dRef.current;
    if (!cur) return;
    if (!confirm(cur.isNew ? "Supprimer ce brouillon ?" : `Supprimer définitivement le jour ${cur.day_number} et ses photos ?`)) return;
    if (!cur.isNew) {
      if (!navigator.onLine) { say("Il faut du réseau pour supprimer une étape publiée."); return; }
      setBusy(true);
      try {
        const { data: rows } = await sba.from("media").select("path,thumb_path").eq("day_id", cur.id);
        const paths = [...(rows ?? []), ...cur.removedMedia].flatMap((m) => [m.path, m.thumb_path]).filter(Boolean) as string[];
        if (paths.length) {
          const { error: es } = await sba.storage.from("media").remove(paths);
          if (es) throw es;
        }
        const { error } = await sba.from("days").delete().eq("id", cur.id);
        if (error) throw error;
      } catch (e) {
        setBusy(false);
        say(`Suppression impossible : ${(e as Error).message}`);
        return;
      }
      setBusy(false);
      loadServer();
    }
    clearTimeout(saveTimer.current);
    closed.current = true;
    await dropDraft(cur.id);
    say("Étape supprimée.");
    home();
  };

  if (!d) return <div class="adm"><p class="adm-sub">Brouillon introuvable.</p><button class="btn" onClick={home}>Retour</button></div>;

  if (picking) {
    const around = (picking === "end" && d.end_lng !== null && d.end_lat !== null ? [d.end_lng, d.end_lat]
      : d.start_lng !== null && d.start_lat !== null ? [d.start_lng, d.start_lat] : route.pointAt(d.start_km ?? 0)) as [number, number];
    return (
      <MapPicker route={route} around={around} onClose={() => setPicking(null)}
        onPick={(p: Pick) => { const which = picking; setPicking(null); if (which === "end") setEnd(p.km, [p.lng, p.lat]); else setStart(p); }} />
    );
  }

  const leg = d.end_km !== null ? route.legAt(d.end_km) : null;
  const kinds: [DayKind, string][] = [["hike", "Marche"], ["rest", "Repos"], ["transport", "Transfert"]];
  const publishedVersion = !d.isNew;

  return (
    <div class="adm">
      <div class="adm-bar">
        <span class="adm-bar__left"><button class="textbtn" type="button" onClick={home}><ChevronLeft />Carnet</button></span>
        <span class="adm-bar__title">Jour {d.day_number}</span>
        <span class="adm-bar__right"><button class="textbtn textbtn--strong" type="button" onClick={publish}>Publier</button></span>
      </div>

      {d.status === "error" && d.error && <p class="danger" style={{ margin: "8px 4px 14px" }}>Dernier envoi : {d.error}</p>}
      {(d.status === "syncing" || d.status === "queued") && (
        <p class="adm-sub" style={{ margin: "8px 4px 14px" }}>
          {d.status === "syncing" ? "Envoi en cours…" : online.value ? "En attente d'envoi…" : "Prêt : part dès que tu as du réseau."} Si tu modifies quelque chose, touche à nouveau « Publier ».
        </p>
      )}

      <div class="group" style={{ marginTop: "8px" }}>
        <label class="cell">
          <span>Date</span>
          <input type="date" value={d.date} onChange={(e) => {
            const date = (e.target as HTMLInputElement).value;
            if (!date) return;
            const prev = previousEnd(date, d.id);
            update({ date, day_number: dayNumberFor(date), ...(d.isNew ? { start_km: prev.km, start_lng: prev.point[0], start_lat: prev.point[1], start_name: prev.name } : {}) });
          }} />
        </label>
        <div class="cell">
          <Seg label="Type de journée" value={d.kind} onChange={(k) => update({ kind: k })} options={kinds.map(([k, label]) => ({ value: k, label }))} />
        </div>
      </div>

      {d.kind !== "rest" && (
        <>
          <div class="group__title">Parcours</div>
          <div class="group">
            <div class="cell">
              <span class="cell__main">
                <span class="cell__title">Départ</span>
                <span class="cell__meta">km {fmtKm(d.start_km ?? 0, "fr", 1)}{d.start_name ? `, ${d.start_name}` : ""}</span>
              </span>
              <button class="textbtn" type="button" onClick={() => setPicking("start")}>Modifier</button>
            </div>
            <div class="cell cell--stack">
              <span class="cell__title">Arrivée</span>
              {d.end_km !== null && (
                <span class="where"><strong class="num">km {fmtKm(d.end_km, "fr", 1)}</strong>{leg ? `, ${leg}` : ""}</span>
              )}
              <div class="pickrow">
                <button class="btn" type="button" onClick={useGps} disabled={gpsBusy}>{gpsBusy ? "Localisation…" : <><Locate />Ma position</>}</button>
                <button class="btn" type="button" onClick={() => setPicking("end")}><MapIcon />Sur la carte</button>
              </div>
              {photoGps && (
                <button class="textbtn" type="button" style={{ textAlign: "left" }} onClick={() => {
                  const s = route.nearest([photoGps.lng!, photoGps.lat!]);
                  setEnd(s.km, s.dist < 400 ? [photoGps.lng!, photoGps.lat!] : s.point);
                }}>Utiliser le lieu de ma dernière photo</button>
              )}
              {gpsMsg && <span class="warn">{gpsMsg}</span>}
            </div>
            <label class="cell">
              <span>Lieu d'arrivée</span>
              <input value={d.end_name ?? ""} placeholder="ex. Blue Lake Hut" onInput={(e) => update({ end_name: (e.target as HTMLInputElement).value || null })} />
            </label>
          </div>

          <div class="group">
            <label class="cell">
              <span>Distance (km)</span>
              <NumField value={d.distance_km} decimals placeholder="auto" onCommit={(v) => { if (v !== dRef.current?.distance_km) update({ distance_km: v }); }} />
            </label>
            <label class="cell">
              <span>Montée (m)</span>
              <NumField value={d.ascent_m} decimals={false} placeholder="auto" onCommit={(v) => { if (v !== dRef.current?.ascent_m) update({ ascent_m: v }); }} />
            </label>
            <label class="cell">
              <span>Descente (m)</span>
              <NumField value={d.descent_m} decimals={false} placeholder="auto" onCommit={(v) => { if (v !== dRef.current?.descent_m) update({ descent_m: v }); }} />
            </label>
            <label class="cell">
              <span>Durée de marche</span>
              <input type="time" value={d.moving_time_min ? `${String(Math.floor(d.moving_time_min / 60)).padStart(2, "0")}:${String(d.moving_time_min % 60).padStart(2, "0")}` : ""}
                onChange={(e) => { const [h, m] = (e.target as HTMLInputElement).value.split(":").map(Number); update({ moving_time_min: Number.isFinite(h) ? h * 60 + (m || 0) : null }); }} />
            </label>
          </div>
          <p class="group__foot">Montée et descente sont calculées depuis le relief si tu les laisses vides.</p>
        </>
      )}

      {d.kind === "rest" && (
        <div class="group">
          <label class="cell">
            <span>Lieu</span>
            <input value={d.end_name ?? d.start_name ?? ""} placeholder="ex. St Arnaud" onInput={(e) => update({ end_name: (e.target as HTMLInputElement).value || null })} />
          </label>
        </div>
      )}

      <div class="group__title">Récit</div>
      <div class="group">
        <label class="cell cell--stack">
          <input value={d.title ?? ""} placeholder="Titre (facultatif)" onInput={(e) => update({ title: (e.target as HTMLInputElement).value || null })} />
        </label>
        <label class="cell cell--stack">
          <textarea value={d.story ?? ""} placeholder="Raconte ta journée… (le micro du clavier marche très bien)"
            onInput={(e) => update({ story: (e.target as HTMLTextAreaElement).value || null })} />
        </label>
        <div class="cell cell--stack">
          <span class="cell__meta">Météo</span>
          <div class="chips">{WEATHER.map((w) => <button type="button" class="chip" aria-pressed={d.weather === w} onClick={() => update({ weather: d.weather === w ? null : w })}>{w}</button>)}</div>
          <span class="cell__meta" style={{ marginTop: "6px" }}>Humeur</span>
          <div class="chips">{MOODS.map((w) => <button type="button" class="chip" aria-pressed={d.mood === w} onClick={() => update({ mood: d.mood === w ? null : w })}>{w}</button>)}</div>
        </div>
        <button class="cell" type="button" onClick={() => setShowEn(!showEn)}>
          <span class="cell__main"><span class="cell__title">Version anglaise (facultatif)</span></span>
          <span class="cell__value">{showEn ? "Masquer" : d.story_en || d.title_en ? "Remplie" : "Ajouter"}</span>
        </button>
        {showEn && (
          <>
            <label class="cell cell--stack">
              <input value={d.title_en ?? ""} placeholder="Title (optional)" onInput={(e) => update({ title_en: (e.target as HTMLInputElement).value || null })} />
            </label>
            <label class="cell cell--stack">
              <textarea value={d.story_en ?? ""} placeholder="Story in English (otherwise visitors get a Translate button)"
                onInput={(e) => update({ story_en: (e.target as HTMLTextAreaElement).value || null })} />
            </label>
          </>
        )}
      </div>

      <div class="group__title">Photos et vidéos</div>
      <div class="group">
        <div class="mgrid">
          {d.media.map((m) => (
            <MediaTile m={m} cover={d.cover_media_id === m.id} progress={progress[m.id]}
              onCover={() => update({ cover_media_id: m.id }, true)} onRemove={() => removeMedia(m)} />
          ))}
          <button type="button" class="mitem mitem--add" onClick={() => fileRef.current?.click()}>+ Ajouter</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => addFiles((e.target as HTMLInputElement).files)} />
        <div class="cell">
          <input style={{ textAlign: "left" }} value={link} placeholder="Lien YouTube pour une longue vidéo" inputMode="url"
            onInput={(e) => setLink((e.target as HTMLInputElement).value)} />
          <button class="textbtn" type="button" onClick={addLink}>Ajouter</button>
        </div>
      </div>
      <p class="group__foot">★ choisit la photo de couverture. Les photos sont allégées sur ton téléphone avant l'envoi ; les vidéos de plus de 2 minutes passent mieux en lien YouTube.</p>

      <button class="bigbtn bigbtn--primary" type="button" onClick={publish}>Publier le jour {d.day_number}</button>
      {publishedVersion && <button class="bigbtn bigbtn--secondary" type="button" onClick={discard}>Annuler mes modifications</button>}
      <button class="bigbtn bigbtn--secondary danger" type="button" disabled={busy} onClick={remove}>{d.isNew ? "Supprimer le brouillon" : "Supprimer l'étape"}</button>
    </div>
  );
}
