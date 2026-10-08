import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { mediaUrl } from "../config";
import { daysBetween, fmtKm, nzToday } from "../lib/format";
import type { Day, DayKind } from "../types";
import { ChevronLeft } from "../ui/icons";
import { shortPlace } from "../ui/TrailStrip";
import { profileFor } from "./elevation";
import { MapPicker, type Pick } from "./MapPicker";
import { home, say } from "./nav";
import { prepareVideo, preparePhoto } from "./media";
import { adminDays, adminMedia, adminRoute, adminSettings, loadServer } from "./server";
import { dropDraft, drafts, getBlob, kick, online, putBlob, saveDraft, type Draft, type DraftMedia } from "./store";
import { sba } from "./sb";

const WEATHER = ["☀️", "🌤️", "⛅", "☁️", "🌧️", "⛈️", "🌨️", "🌬️", "🌫️"];
const MOODS = ["😄", "😊", "😌", "😐", "😩", "🥵", "🥶", "😴", "🤕"];

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

/** Today's draft, today's published day, or a fresh one. */
export function draftForToday(): Draft {
  const today = nzToday();
  const existingDraft = drafts.value.find((d) => d.date === today);
  if (existingDraft) return existingDraft;
  const published = adminDays.value.find((d) => d.date === today);
  return published ? draftFromDay(published) : newDraft(today);
}

// ------------------------------------------------------------------ thumbnails from IndexedDB
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

function MediaTile({ m, cover, onCover, onRemove }: { m: DraftMedia; cover: boolean; onCover: () => void; onRemove: () => void }) {
  const local = useBlobUrl(m.thumbKey);
  const src = local ?? (m.thumb_path ? mediaUrl(m.thumb_path) : null);
  const state = m.preparing ? "Préparation…" : m.error ? null : !m.uploaded && m.kind !== "embed" ? "En attente" : null;
  return (
    <div class="mitem">
      {src ? <img src={src} alt="" /> : <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: "26px" }}>{m.kind === "embed" ? "▶︎" : "⏳"}</div>}
      {m.kind !== "photo" && <span class="mitem__badge">{m.kind === "embed" ? "Lien" : m.duration_s ? `${Math.round(m.duration_s)} s` : "Vidéo"}</span>}
      {m.kind === "photo" && <button type="button" class="mitem__star" aria-pressed={cover} aria-label="Photo de couverture" onClick={onCover}>★</button>}
      <button type="button" class="mitem__del" aria-label="Retirer" onClick={onRemove}>✕</button>
      {state && <span class="mitem__badge" style={{ top: "auto", bottom: "6px" }}>{state}</span>}
      {m.progress !== undefined && m.progress > 0 && m.progress < 1 && <div class="mitem__state"><span style={{ width: `${m.progress * 100}%` }} /></div>}
      {m.error && <div class="mitem__err">{m.error}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ editor
export function Editor({ id }: { id: string }) {
  const route = adminRoute.value;
  const [d, setD] = useState<Draft | null>(() => drafts.value.find((x) => x.id === id) ?? null);
  const [picking, setPicking] = useState<null | "end" | "start">(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [showEn, setShowEn] = useState(false);
  const [link, setLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number>();

  useEffect(() => {
    if (!d) {
      const found = drafts.value.find((x) => x.id === id);
      if (found) setD(found);
    }
  }, [drafts.value]);

  const update = (patch: Partial<Draft>, immediate = false) => {
    setD((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...patch, status: cur.status === "done" ? "editing" : cur.status } as Draft;
      if (next.status !== "editing" && !patch.status) next.status = "editing";
      clearTimeout(saveTimer.current);
      if (immediate) saveDraft(next);
      else saveTimer.current = window.setTimeout(() => saveDraft(next), 350);
      return next;
    });
  };

  const setEnd = async (km: number, point: [number, number], nameHint?: string | null) => {
    if (!d) return;
    const start = d.start_km ?? 0;
    const near = route.places().reduce((b, p) => (Math.abs(p.km - km) < Math.abs(b.km - km) ? p : b));
    const name = nameHint ?? (Math.abs(near.km - km) < 2.5 ? shortPlace(near.n) : d.end_name);
    const dist = Math.max(0, Math.round((km - start) * 10) / 10);
    update({ end_km: km, end_lng: point[0], end_lat: point[1], end_name: name ?? null, distance_km: dist, track: null, ascent_m: null, descent_m: null }, true);
    if (navigator.onLine && d.kind === "hike" && km - start > 0.2) {
      const prof = await profileFor(route, start, km, adminSettings.value?.linz_api_key).catch(() => null);
      if (prof) update({ track: { p: prof.p }, ascent_m: prof.up, descent_m: prof.down }, true);
    }
  };

  const useGps = () => {
    if (!("geolocation" in navigator)) { setGpsMsg("La localisation n'est pas disponible sur cet appareil."); return; }
    setGpsBusy(true); setGpsMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        const s = route.nearest([pos.coords.longitude, pos.coords.latitude]);
        if (s.dist > 5000) setGpsMsg(`Tu es à ${fmtKm(s.dist / 1000, "fr", 1)} km du sentier : j'ai placé l'arrivée sur le point le plus proche.`);
        setEnd(s.km, s.dist < 400 ? [pos.coords.longitude, pos.coords.latitude] : s.point);
      },
      (err) => {
        setGpsBusy(false);
        setGpsMsg(err.code === 1 ? "Autorise la localisation pour ce site dans les réglages de Safari." : "Position introuvable. Réessaie à découvert ou choisis sur la carte.");
      },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 120000 },
    );
  };

  const photoGps = useMemo(() => {
    const withGps = (d?.media ?? []).filter((m) => m.lat !== null && m.lng !== null && m.taken_at).sort((a, b) => (a.taken_at! < b.taken_at! ? 1 : -1));
    return withGps[0] ?? null;
  }, [d?.media]);

  const addFiles = async (files: FileList | null) => {
    if (!files || !d) return;
    let cur = d;
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const m: DraftMedia = {
        id: crypto.randomUUID(), kind: isVideo ? "video" : "photo", mainKey: null, thumbKey: null, mime: isVideo ? "video/mp4" : "image/jpeg",
        width: null, height: null, duration_s: null, taken_at: null, lat: null, lng: null, caption: null, embed_url: null,
        bytes: null, path: null, thumb_path: null, uploaded: false, sort: cur.media.length, preparing: true,
      };
      cur = { ...cur, media: [...cur.media, m] };
      setD(cur); await saveDraft(cur);
      try {
        const p = isVideo ? await prepareVideo(file, (f) => { m.progress = f; setD((x) => (x ? { ...x } : x)); }) : await preparePhoto(file);
        m.mainKey = `${m.id}:main`; m.thumbKey = `${m.id}:thumb`;
        await putBlob(m.mainKey, p.main); await putBlob(m.thumbKey, p.thumb);
        Object.assign(m, {
          width: p.width, height: p.height, duration_s: p.duration, taken_at: p.takenAt, lat: p.lat, lng: p.lng,
          bytes: p.main.size + p.thumb.size, preparing: false, progress: undefined, mime: p.kind === "video" ? p.main.type || "video/mp4" : "image/jpeg",
        });
      } catch (e) {
        m.preparing = false; m.error = (e as Error).message?.slice(0, 120) || "Fichier illisible";
      }
      cur = { ...cur, media: cur.media.map((x) => (x.id === m.id ? { ...m } : x)) };
      if (!cur.cover_media_id && m.kind === "photo" && !m.error) cur.cover_media_id = m.id;
      setD(cur); await saveDraft(cur);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const addLink = () => {
    if (!d || !/^https:\/\//.test(link.trim())) { say("Colle un lien qui commence par https://"); return; }
    const m: DraftMedia = {
      id: crypto.randomUUID(), kind: "embed", mainKey: null, thumbKey: null, mime: null, width: null, height: null, duration_s: null,
      taken_at: null, lat: null, lng: null, caption: null, embed_url: link.trim(), bytes: null, path: null, thumb_path: null, uploaded: true, sort: d.media.length,
    };
    update({ media: [...d.media, m] }, true);
    setLink("");
  };

  const removeMedia = (m: DraftMedia) => {
    if (!d) return;
    const remote = !d.isNew && m.uploaded && (m.path || m.kind === "embed") && !m.mainKey;
    update({
      media: d.media.filter((x) => x.id !== m.id),
      removedMedia: remote ? [...d.removedMedia, { id: m.id, path: m.path, thumb_path: m.thumb_path }] : d.removedMedia,
      cover_media_id: d.cover_media_id === m.id ? null : d.cover_media_id,
    }, true);
  };

  const publish = async () => {
    if (!d) return;
    if (d.kind !== "rest" && d.end_km === null) { say("Indique d'abord ton point d'arrivée."); return; }
    const preparing = d.media.some((m) => m.preparing);
    if (preparing) { say("Attends la fin de la préparation des photos."); return; }
    const end = d.kind === "rest" ? { end_km: d.start_km, end_lng: d.start_lng, end_lat: d.start_lat, end_name: d.end_name ?? d.start_name, distance_km: 0 } : {};
    const next = { ...d, ...end, status: "queued" as const, error: null };
    await saveDraft(next);
    kick();
    say(online.value ? "Publication en cours…" : "Enregistré. Publication dès que tu as du réseau.");
    home();
  };

  const remove = async () => {
    if (!d) return;
    if (!confirm(d.isNew ? "Supprimer ce brouillon ?" : `Supprimer définitivement le jour ${d.day_number} et ses photos ?`)) return;
    if (!d.isNew) {
      if (!navigator.onLine) { say("Il faut du réseau pour supprimer une étape publiée."); return; }
      const paths = adminMedia.value.filter((m) => m.day_id === d.id).flatMap((m) => [m.path, m.thumb_path]).filter(Boolean) as string[];
      if (paths.length) await sba.storage.from("media").remove(paths);
      const { error } = await sba.from("days").delete().eq("id", d.id);
      if (error) { say(`Suppression impossible : ${error.message}`); return; }
      await loadServer();
    }
    await dropDraft(d.id);
    say("Étape supprimée.");
    home();
  };

  if (!d) return <div class="adm"><p class="adm-sub">Brouillon introuvable.</p><button class="btn" onClick={home}>Retour</button></div>;

  if (picking) {
    const around = (picking === "end" && d.end_lng !== null && d.end_lat !== null ? [d.end_lng, d.end_lat]
      : d.start_lng !== null && d.start_lat !== null ? [d.start_lng, d.start_lat] : route.pointAt(d.start_km ?? 0)) as [number, number];
    return (
      <MapPicker route={route} around={around} onClose={() => setPicking(null)}
        onPick={(p: Pick) => {
          setPicking(null);
          if (picking === "end") setEnd(p.km, [p.lng, p.lat]);
          else update({ start_km: p.km, start_lng: p.lng, start_lat: p.lat, distance_km: d.end_km !== null ? Math.max(0, Math.round((d.end_km - p.km) * 10) / 10) : d.distance_km }, true);
        }} />
    );
  }

  const leg = d.end_km !== null ? route.legAt(d.end_km) : null;
  const kinds: [DayKind, string][] = [["hike", "Marche"], ["rest", "Repos"], ["transport", "Transfert"]];

  return (
    <div class="adm">
      <div class="adm-bar">
        <span class="adm-bar__left"><button class="textbtn" type="button" onClick={home}><ChevronLeft />Carnet</button></span>
        <span class="adm-bar__title">Jour {d.day_number}</span>
        <span class="adm-bar__right"><button class="textbtn textbtn--strong" type="button" onClick={publish}>Publier</button></span>
      </div>

      {d.status === "error" && d.error && <p class="danger" style={{ margin: "8px 4px 14px" }}>Dernier envoi : {d.error}</p>}

      <div class="group" style={{ marginTop: "8px" }}>
        <label class="cell">
          <span>Date</span>
          <input type="date" value={d.date} onInput={(e) => {
            const date = (e.target as HTMLInputElement).value;
            if (!date) return;
            const prev = previousEnd(date, d.id);
            update({ date, day_number: dayNumberFor(date), ...(d.isNew ? { start_km: prev.km, start_lng: prev.point[0], start_lat: prev.point[1], start_name: prev.name } : {}) });
          }} />
        </label>
        <div class="cell">
          <div class="seg" role="group" aria-label="Type de journée">
            {kinds.map(([k, label]) => <button type="button" aria-pressed={d.kind === k} onClick={() => update({ kind: k })}>{label}</button>)}
          </div>
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
                <button class="btn" type="button" onClick={useGps} disabled={gpsBusy}>{gpsBusy ? "Localisation…" : "📍 Ma position"}</button>
                <button class="btn" type="button" onClick={() => setPicking("end")}>🗺️ Sur la carte</button>
              </div>
              {photoGps && (
                <button class="textbtn" type="button" style={{ textAlign: "left" }} onClick={() => {
                  const s = route.nearest([photoGps.lng!, photoGps.lat!]);
                  setEnd(s.km, [photoGps.lng!, photoGps.lat!]);
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
              <input inputMode="decimal" value={d.distance_km ?? ""} placeholder="auto"
                onInput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value.replace(",", ".")); update({ distance_km: Number.isFinite(v) ? v : null }); }} />
            </label>
            <label class="cell">
              <span>Montée (m)</span>
              <input inputMode="numeric" value={d.ascent_m ?? ""} placeholder="auto"
                onInput={(e) => { const v = parseInt((e.target as HTMLInputElement).value, 10); update({ ascent_m: Number.isFinite(v) ? v : null }); }} />
            </label>
            <label class="cell">
              <span>Descente (m)</span>
              <input inputMode="numeric" value={d.descent_m ?? ""} placeholder="auto"
                onInput={(e) => { const v = parseInt((e.target as HTMLInputElement).value, 10); update({ descent_m: Number.isFinite(v) ? v : null }); }} />
            </label>
            <label class="cell">
              <span>Durée de marche</span>
              <input type="time" value={d.moving_time_min ? `${String(Math.floor(d.moving_time_min / 60)).padStart(2, "0")}:${String(d.moving_time_min % 60).padStart(2, "0")}` : ""}
                onInput={(e) => { const [h, m] = (e.target as HTMLInputElement).value.split(":").map(Number); update({ moving_time_min: Number.isFinite(h) ? h * 60 + (m || 0) : null }); }} />
            </label>
          </div>
          <p class="group__foot">Montée et descente sont calculées automatiquement depuis le relief si tu les laisses vides.</p>
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
            <MediaTile m={m} cover={d.cover_media_id === m.id} onCover={() => update({ cover_media_id: m.id }, true)} onRemove={() => removeMedia(m)} />
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
      <p class="group__foot">★ choisit la photo de couverture. Les photos sont allégées sur ton téléphone avant l'envoi.</p>

      <button class="bigbtn bigbtn--primary" type="button" onClick={publish}>Publier le jour {d.day_number}</button>
      <button class="bigbtn bigbtn--secondary danger" type="button" onClick={remove}>{d.isNew ? "Supprimer le brouillon" : "Supprimer l'étape"}</button>
    </div>
  );
}
