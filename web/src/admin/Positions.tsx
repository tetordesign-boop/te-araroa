// "Ma position": what the site has received from the phone (OwnTracks or by hand), on a map and in a list,
// who can see each point, a way to test the chain end to end, and to delete a wrong point. Works from the phone.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { MOCK, OFFLINE_MAP } from "../config";
import { fmtDate, fmtKm, nzToday, relTime } from "../lib/format";
import type { LngLat } from "../lib/geo";
import { buildStyle } from "../map/style";
import { ChevronLeft, ChevronRight } from "../ui/icons";
import { home, open, say } from "./nav";
import { adminRoute, adminSettings } from "./server";
import { sba } from "./sb";

export interface Pos {
  id: number; recorded_at: string; lng: number; lat: number;
  alt: number | null; acc: number | null; batt: number | null; source: string; note: string | null;
}

const SOURCE: Record<string, string> = { owntracks: "OwnTracks", checkin: "à la main", photo: "photo", manual: "à la main" };

/** Who sees a point on the site, said plainly (same rule as the database: from the departure date, after the delay). */
export function visibility(p: { recorded_at: string }, start: string | null, delayMin: number, now = Date.now()): { open: boolean; text: string } {
  if (!start) return { open: false, text: "Privé : pas encore de date de départ" };
  if (nzToday(new Date(p.recorded_at)) < start) return { open: false, text: "Privé : avant ta date de départ" };
  const left = new Date(p.recorded_at).getTime() + delayMin * 60_000 - now;
  if (left > 0) return { open: false, text: `Public dans ${left > 90 * 60_000 ? `${Math.round(left / 3_600_000)} h` : `${Math.max(1, Math.round(left / 60_000))} min`}` };
  return { open: true, text: "Visible sur le site" };
}

/** Sample points for the preview without a backend (?mock). */
function mockPositions(): Pos[] {
  const r = adminRoute.value;
  const now = Date.now();
  return Array.from({ length: 9 }, (_, i) => {
    const [lng, lat] = r.pointAt(348 - i * 2.2);
    return { id: 100 - i, recorded_at: new Date(now - (i * 47 + 6) * 60_000).toISOString(), lng, lat, alt: 900 + i * 20, acc: 8 + i, batt: 84 - i * 3, source: i === 3 ? "checkin" : "owntracks", note: null };
  });
}

export async function fetchPositions(limit = 50): Promise<Pos[]> {
  if (MOCK) return mockPositions().slice(0, limit);
  const { data, error } = await sba.from("positions").select("id,recorded_at,lng,lat,alt,acc,batt,source,note").order("recorded_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Pos[];
}

function where(p: Pos): string {
  const s = adminRoute.value.nearest([p.lng, p.lat]);
  return s.dist < 3000 ? `sur le sentier, km ${fmtKm(s.km, "fr", s.km < 10 ? 1 : 0)}` : `à ${fmtKm(s.dist / 1000, "fr", s.dist < 10_000 ? 1 : 0)} km du sentier`;
}

function PointsMap({ list }: { list: Pos[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);

  const draw = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const pts = [...list].reverse().map((p) => [p.lng, p.lat] as LngLat); // oldest first
    (m.getSource("track") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } });
    (m.getSource("pts") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: list.map((p, i) => ({ type: "Feature", properties: { last: i === 0 }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
    });
    if (!pts.length) return;
    const b = pts.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0]));
    m.fitBounds(b, { padding: 50, maxZoom: 14, duration: 0 });
  };

  useEffect(() => {
    let land: GeoJSON.Feature | undefined;
    let alive = true;
    (async () => {
      if (OFFLINE_MAP) land = (await import("../dev/nz-land.json")).default as unknown as GeoJSON.Feature;
      if (!alive || !el.current) return;
      const style = buildStyle("satellite", { dark: false, linzKey: adminSettings.value?.linz_api_key, land });
      delete (style as { terrain?: unknown }).terrain; // flat and exact
      const first = list[0] ? [list[0].lng, list[0].lat] as LngLat : adminRoute.value.pointAt(0);
      const m = new maplibregl.Map({ container: el.current, style, center: first, zoom: 11, attributionControl: { compact: true }, maxPitch: 0, dragRotate: false });
      map.current = m;
      m.on("load", () => {
        const r = adminRoute.value;
        m.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: r.parts.map((p) => Array.from(p.lng, (x, i) => [x, p.lat[i]])) } } });
        m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "rgba(0,0,0,.45)", "line-width": 5 } });
        m.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#fff", "line-width": 2.5 } });
        m.addSource("track", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "track", type: "line", source: "track", paint: { "line-color": "#FF6B12", "line-width": 2.5, "line-dasharray": [1, 1.5] } });
        m.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "pts", type: "circle", source: "pts",
          paint: {
            "circle-radius": ["case", ["get", "last"], 9, 5],
            "circle-color": ["case", ["get", "last"], "#FF6B12", "#FFB48A"],
            "circle-stroke-color": "#fff", "circle-stroke-width": ["case", ["get", "last"], 3, 1.5],
          },
        });
        ready.current = true;
        draw();
      });
    })();
    return () => { alive = false; ready.current = false; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(draw, [list]);
  return <div class="posmap" ref={el} />;
}

export function Positions() {
  const s = adminSettings.value;
  const [list, setList] = useState<Pos[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [, tick] = useState(0);

  const load = async () => {
    try {
      setList(await fetchPositions());
      setErr(null);
    } catch (e) {
      setErr(navigator.onLine ? `Lecture impossible : ${(e as Error).message}` : "Hors ligne : reviens ici quand tu as du réseau.");
    }
  };
  useEffect(() => {
    load();
    // a point sent from OwnTracks shows up here on its own while the page is open
    const id = window.setInterval(() => { if (document.visibilityState === "visible") { load(); tick((n) => n + 1); } }, 15_000);
    return () => clearInterval(id);
  }, []);

  const remove = async (p: Pos) => {
    if (!confirm("Supprimer ce point ? Il disparaît aussi du site.")) return;
    setBusy(p.id);
    const { error } = MOCK ? { error: null } : await sba.from("positions").delete().eq("id", p.id);
    setBusy(null);
    if (error) { say(`Erreur : ${error.message}`); return; }
    if (MOCK) setList((l) => (l ?? []).filter((x) => x.id !== p.id));
    else await load();
    say("Point supprimé.");
  };

  const start = s?.start_date ?? null;
  const delay = s?.position_delay_minutes ?? 0;
  const last = list?.[0] ?? null;
  const lastOwn = list?.find((p) => p.source === "owntracks") ?? null;
  const ownFresh = !!lastOwn && Date.now() - new Date(lastOwn.recorded_at).getTime() < 30 * 60_000;

  return (
    <div class="adm">
      <div class="adm-bar">
        <span class="adm-bar__left"><button class="textbtn" type="button" onClick={home}><ChevronLeft />Carnet</button></span>
        <span class="adm-bar__title">Ma position</span>
        <span class="adm-bar__right"><button class="textbtn" type="button" onClick={() => { load(); say("À jour."); }}>Actualiser</button></span>
      </div>

      <div class="group" style={{ marginTop: "8px" }}>
        <div class="cell cell--stack">
          {last ? (
            <>
              <span class="cell__title">Dernier point reçu {relTime(last.recorded_at, "fr")}</span>
              <span class="cell__meta">{SOURCE[last.source] ?? last.source}, {where(last)}{last.acc ? `, précision ${Math.round(last.acc)} m` : ""}{last.batt ? `, batterie ${last.batt} %` : ""}</span>
              {(() => { const v = visibility(last, start, delay); return <span class={`vis${v.open ? " is-open" : ""}`}>{v.text}</span>; })()}
            </>
          ) : <span class="cell__meta">{err ?? (list ? "Aucun point reçu pour l'instant." : "Chargement…")}</span>}
        </div>
      </div>

      {list && list.length > 0 && <PointsMap list={list} />}

      <button class="bigbtn bigbtn--primary" type="button" onClick={() => open({ name: "checkin" })}>📍 Envoyer ma position maintenant</button>

      {!ownFresh && (
        <>
          <div class="group__title">Tester le suivi automatique</div>
          <div class="group">
            <ol class="steps">
              <li>Ouvre OwnTracks et touche le bouton qui envoie ta position (la flèche en haut de la carte).</li>
              <li>Reviens ici : le point arrive en moins d'une minute, marqué « OwnTracks ».</li>
              <li>Rien au bout de deux minutes ? Vérifie le réglage dans <button class="textbtn" type="button" onClick={() => open({ name: "tracking" })}>Suivi automatique</button>.</li>
            </ol>
          </div>
        </>
      )}

      <p class="group__foot" style={{ margin: "2px 16px 22px" }}>
        {start
          ? <>Tes proches voient ta dernière position à partir du {fmtDate(start, "fr", { day: "numeric", month: "long" })}{delay ? `, avec ${delay >= 60 ? `${delay / 60} h` : `${delay} min`} de retard` : ""}. Avant, tout reste privé : tu peux tester autant que tu veux.</>
          : <>Tant que ta date de départ n'est pas indiquée (Réglages), personne ne voit ta position : tu peux tester autant que tu veux.</>}
      </p>

      {list && list.length > 0 && (
        <>
          <div class="group__title">Derniers points</div>
          <div class="group">
            {list.slice(0, 30).map((p) => {
              const v = visibility(p, start, delay);
              return (
                <div class="cell cell--stack">
                  <span class="cell__title">{new Date(p.recorded_at).toLocaleString("fr-FR", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, {SOURCE[p.source] ?? p.source}</span>
                  <span class="cell__meta">{where(p)}{p.acc ? `, précision ${Math.round(p.acc)} m` : ""}{p.note ? `, « ${p.note} »` : ""}</span>
                  <div class="pickrow">
                    <span class={`vis${v.open ? " is-open" : ""}`}>{v.text}</span>
                    <button class="btn danger" type="button" disabled={busy === p.id} onClick={() => remove(p)}>Supprimer</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div class="group">
        <button class="cell" type="button" onClick={() => open({ name: "tracking" })}><span class="cell__main"><span class="cell__title">Suivi automatique</span><span class="cell__meta">Régler OwnTracks, le mettre en pause</span></span><ChevronRight class="cell__chev" /></button>
        <button class="cell" type="button" onClick={() => open({ name: "settings" })}><span class="cell__main"><span class="cell__title">Date de départ et retard</span><span class="cell__meta">Réglages, confidentialité</span></span><ChevronRight class="cell__chev" /></button>
      </div>
    </div>
  );
}
