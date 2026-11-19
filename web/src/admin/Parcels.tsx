// The Carnet's "Colis": the food parcels Ewan sends himself along the trail (where each waits, when it left, what is
// in it, whether he has it), kept in the private `parcels` table (supabase/migrations/20261119000100_parcels.sql).
// Above them, the long stretches with no shop on the trail, worked out from the site's own map data: where a
// parcel saves carrying everything. The list is kept on the phone too, to be read with no signal.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { MOCK } from "../config";
import { haversine } from "../lib/geo";
import type { Poi } from "../map/pois";
import { Bar } from "./Pages";
import { say } from "./nav";
import { sba } from "./sb";
import { adminRoute } from "./server";

export type ParcelStatus = "planned" | "sent" | "collected";
export interface Parcel {
  id: string;
  place: string;
  km: number | null;
  status: ParcelStatus;
  sent_on: string | null;
  contents: string | null;
  tracking: string | null;
}

const STATUS: [ParcelStatus, string][] = [["planned", "Prévu"], ["sent", "Envoyé"], ["collected", "Récupéré"]];
const statusName = (s: ParcelStatus) => STATUS.find(([k]) => k === s)?.[1] ?? s;

const KEY = "ta-parcels-v1";
const readCache = (): Parcel[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Parcel[]; } catch { return []; } };
const writeCache = (l: Parcel[]) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private mode */ } };

export const parcels = signal<Parcel[]>(readCache());
const byKm = (a: Parcel, b: Parcel) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.place.localeCompare(b.place);

export async function loadParcels() {
  if (MOCK) return;
  const { data, error } = await sba.from("parcels").select("id, place, km, status, sent_on, contents, tracking");
  if (error || !data) return;
  parcels.value = (data as Parcel[]).sort(byKm);
  writeCache(parcels.value);
}

/** the home cell's line */
export function parcelsLine(): string {
  const l = parcels.value;
  if (!l.length) return "Où t'attend ta nourriture";
  const n = (s: ParcelStatus) => l.filter((p) => p.status === s).length;
  const sent = n("sent"), planned = n("planned");
  const parts = [sent ? `${sent} ${sent > 1 ? "envoyés" : "envoyé"}` : "", planned ? `${planned} ${planned > 1 ? "prévus" : "prévu"}` : ""].filter(Boolean);
  return parts.length ? `${l.length} colis : ${parts.join(", ")}` : `${l.length} colis, ${l.length > 1 ? "tous récupérés" : "récupéré"}`;
}

// ------------------------------------------------------------------ the stretches with no shop

/** "Arthur's Pass (Klondyke Corner)", "Bluff · Stirling Point" → the town */
const town = (n: string) => n.replace(/\s*\(.*\)$/, "").replace(/ · .*$/, "");
const fmtKm = (km: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(km);
const FOOD = new Set(["super", "general", "conv"]);

interface Stretch { from: string; to: string; a: number; b: number }
const stretches = signal<Stretch[] | null>(null);

async function loadStretches() {
  if (stretches.value) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/pois.json`, { cache: "default" });
    const pois = ((await res.json()) as { pois: Poi[] }).pois;
    const stations = adminRoute.value.places();
    const total = stations[stations.length - 1]?.km ?? 0;
    // each shop named after the trail's town it is in, else the town in its address ("Arthur's Pass", off the
    // trail), else the trail's town nearby, else its own name
    const label = (p: Poi) => {
      const near = stations.map((s) => ({ s, m: haversine(p.c, s.c) })).sort((a, b) => a.m - b.m)[0];
      if (near && near.m < 3000) return town(near.s.n);
      if (p.town) return p.town.replace(/ National Park$/, "");
      return near && near.m < 10000 ? town(near.s.n) : p.n;
    };
    const shops = pois.filter((p) => p.t === "shop" && FOOD.has(p.sub ?? "")).sort((a, b) => a.km - b.km);
    const marks = [{ n: town(stations[0]?.n ?? "Ship Cove"), km: 0 }, ...shops.map((p) => ({ n: label(p), km: p.km })), { n: town(stations[stations.length - 1]?.n ?? "Bluff"), km: total }];
    const out: Stretch[] = [];
    for (let i = 1; i < marks.length; i++) {
      if (marks[i].km - marks[i - 1].km >= 100) out.push({ from: marks[i - 1].n, to: marks[i].n, a: marks[i - 1].km, b: marks[i].km });
    }
    stretches.value = out;
  } catch (_) { /* offline: the list of parcels is still there */ }
}

// ------------------------------------------------------------------ the page

const blank = (): Parcel => ({ id: "", place: "", km: null, status: "planned", sent_on: null, contents: null, tracking: null });

export function ParcelsPage() {
  const [editing, setEditing] = useState<Parcel | null>(null);
  useEffect(() => { loadParcels(); loadStretches(); }, []);
  const list = parcels.value;
  const s = stretches.value;

  return (
    <div class="adm parcels">
      <Bar title="Colis" right={!editing ? <button class="textbtn textbtn--strong" type="button" onClick={() => setEditing(blank())}>Ajouter</button> : undefined} />
      <p class="adm-sub" style={{ marginTop: "12px" }}>Les colis de nourriture que tu t'envoies le long du sentier. Toi seul les vois : le site ne les montre pas.</p>

      {editing && !editing.id && <ParcelEditor p={editing} close={() => setEditing(null)} />}

      <div class="group__title">Tes colis</div>
      <div class="group">
        {!list.length && !editing && <div class="cell"><span class="cell__meta">Aucun colis pour l'instant. Touche « Ajouter » en haut.</span></div>}
        {list.map((p) => (editing?.id === p.id ? <ParcelEditor p={editing} close={() => setEditing(null)} /> : (
          <button class="cell" type="button" onClick={() => setEditing(p)}>
            <span class="cell__main">
              <span class="cell__title">{p.place}</span>
              <span class="cell__meta">{[p.km !== null ? `km ${fmtKm(p.km)}` : null, p.sent_on ? `envoyé le ${new Date(`${p.sent_on}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : null, p.contents].filter(Boolean).join(" · ")}</span>
            </span>
            <span class={`parcel__status is-${p.status}`}>{statusName(p.status)}</span>
          </button>
        )))}
      </div>

      <div class="group__title">Portions sans magasin sur le sentier</div>
      <div class="group">
        {s === null && <div class="cell"><span class="cell__meta">Il faut du réseau une première fois pour les calculer.</span></div>}
        {s?.map((x) => (
          <div class="cell">
            <span class="cell__main">
              <span class="cell__title">{x.from} → {x.to}</span>
              <span class="cell__meta">du km {fmtKm(x.a)} au km {fmtKm(x.b)}</span>
            </span>
            <span class="cell__value num">{fmtKm(x.b - x.a)} km</span>
          </div>
        ))}
      </div>
      <p class="note">Calculé d'après la carte du site (OpenStreetMap) : un magasin à moins de 5 km du sentier compte. Vérifie les horaires avant d'y compter.</p>
    </div>
  );
}

function ParcelEditor({ p, close }: { p: Parcel; close: () => void }) {
  const [d, setD] = useState<Parcel>(p);
  const [busy, setBusy] = useState(false);
  const stations = adminRoute.value.places();
  const val = (e: Event) => (e.target as HTMLInputElement).value;
  // a trail stop typed or picked: its km comes with it
  const setPlace = (place: string) => {
    const s = stations.find((x) => town(x.n).toLowerCase() === place.trim().toLowerCase() || x.n.toLowerCase() === place.trim().toLowerCase());
    setD({ ...d, place, km: s ? Math.round(s.km * 10) / 10 : d.place === place ? d.km : null });
  };

  const save = async () => {
    const row = {
      place: d.place.trim(), km: d.km, status: d.status, sent_on: d.sent_on || null,
      contents: d.contents?.trim() || null, tracking: d.tracking?.trim() || null,
    };
    if (!row.place) { say("Écris où le colis t'attend."); return; }
    setBusy(true);
    let saved: Parcel | null = null;
    if (MOCK) saved = { ...row, id: d.id || Math.random().toString(36).slice(2) };
    else {
      const q = d.id ? sba.from("parcels").update(row).eq("id", d.id) : sba.from("parcels").insert(row);
      const { data, error } = await q.select("id, place, km, status, sent_on, contents, tracking").single();
      if (error) { setBusy(false); say("Pas enregistré : vérifie le réseau et réessaie."); return; }
      saved = data as Parcel;
    }
    parcels.value = [...parcels.value.filter((x) => x.id !== saved!.id), saved].sort(byKm);
    writeCache(parcels.value);
    setBusy(false);
    say(d.id ? "Colis mis à jour." : "Colis ajouté.");
    close();
  };

  const remove = async () => {
    if (!d.id || !confirm(`Retirer le colis pour ${d.place} ?`)) return;
    setBusy(true);
    const { error } = MOCK ? { error: null } : await sba.from("parcels").delete().eq("id", d.id);
    setBusy(false);
    if (error) { say("Pas retiré : vérifie le réseau et réessaie."); return; }
    parcels.value = parcels.value.filter((x) => x.id !== d.id);
    writeCache(parcels.value);
    say("Colis retiré.");
    close();
  };

  return (
    <div class="gearedit__item parcels__edit">
      <label class="cell"><span>Où</span><input value={d.place} list="parcel-places" placeholder="une étape, un lodge, une poste" autoFocus={!d.id} onInput={(e) => setPlace(val(e))} /></label>
      <datalist id="parcel-places">{stations.map((s) => <option value={town(s.n)} />)}</datalist>
      <div class="cell"><span>Km</span><span style={{ flex: 1 }} /><span class="cell__value num">{d.km !== null ? fmtKm(d.km) : "hors des étapes"}</span></div>
      <div class="cell">
        <div class="seg" role="group" aria-label="Où en est le colis">
          {STATUS.map(([k, name]) => <button type="button" aria-pressed={d.status === k} onClick={() => setD({ ...d, status: k, sent_on: k !== "planned" && !d.sent_on ? new Date().toISOString().slice(0, 10) : d.sent_on })}>{name}</button>)}
        </div>
      </div>
      <label class="cell"><span>Envoyé le</span><input type="date" value={d.sent_on ?? ""} onInput={(e) => setD({ ...d, sent_on: val(e) || null })} /></label>
      <label class="cell"><span>Suivi</span><input value={d.tracking ?? ""} placeholder="numéro de suivi (facultatif)" autoComplete="off" onInput={(e) => setD({ ...d, tracking: val(e) })} /></label>
      <label class="cell cell--stack"><textarea class="short" value={d.contents ?? ""} placeholder="Ce qu'il y a dedans : 5 jours de repas, gaz, chaussettes…" onInput={(e) => setD({ ...d, contents: (e.target as HTMLTextAreaElement).value })} /></label>
      <div class="cell">
        {d.id && <button class="textbtn danger" type="button" disabled={busy} onClick={remove}>Retirer</button>}
        <span style={{ flex: 1 }} />
        <button class="textbtn" type="button" disabled={busy} onClick={close}>Annuler</button>
        <button class="textbtn textbtn--strong" type="button" disabled={busy} onClick={save}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}
