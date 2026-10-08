import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { OFFLINE_MAP } from "../config";
import { fmtKm } from "../lib/format";
import type { LngLat, Route } from "../lib/geo";
import { buildStyle } from "../map/style";
import { adminSettings } from "./server";

export interface Pick { km: number; lng: number; lat: number; dist: number }

export function MapPicker({ route, around, onPick, onClose }: { route: Route; around: LngLat; onPick: (p: Pick) => void; onClose: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Pick | null>(null);
  const [leg, setLeg] = useState<string | null>(null);

  useEffect(() => {
    let land: GeoJSON.Feature | undefined;
    let map: maplibregl.Map | null = null;
    let marker: maplibregl.Marker | null = null;
    (async () => {
      if (OFFLINE_MAP) land = (await import("../dev/nz-land.json")).default as unknown as GeoJSON.Feature;
      const style = buildStyle("satellite", { dark: false, linzKey: adminSettings.value?.linz_api_key, land });
      delete (style as { terrain?: unknown }).terrain; // flat & precise for picking
      map = new maplibregl.Map({ container: el.current!, style, center: around, zoom: 13, attributionControl: false, maxPitch: 0 });
      map.on("load", () => {
        const lines = route.parts.map((p) => Array.from(p.lng, (x, i) => [x, p.lat[i]]));
        map!.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } } });
        map!.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "rgba(0,0,0,.5)", "line-width": 6 } });
        map!.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#fff", "line-width": 3 } });
        const dot = document.createElement("div");
        dot.className = "snap-dot";
        marker = new maplibregl.Marker({ element: dot }).setLngLat(around).addTo(map!);
        update();
      });
      const update = () => {
        if (!map) return;
        const c = map.getCenter();
        const s = route.nearest([c.lng, c.lat]);
        marker?.setLngLat(s.point);
        setSnap({ km: s.km, lng: s.point[0], lat: s.point[1], dist: s.dist });
        setLeg(route.legAt(s.km));
      };
      map.on("move", update);
    })();
    return () => map?.remove();
  }, []);

  return (
    <div class="picker">
      <div class="map" ref={el} />
      <svg class="picker__cross" viewBox="0 0 30 30" aria-hidden="true"><path d="M15 3v9M15 18v9M3 15h9M18 15h9" stroke="#fff" stroke-width="2.5" stroke-linecap="round" /></svg>
      <div class="picker__top">
        <button class="btn glass" type="button" onClick={onClose}>Annuler</button>
      </div>
      <div class="picker__panel glass">
        <div class="where">
          {snap ? (
            <>
              <strong class="num">km {fmtKm(snap.km, "fr", 1)}</strong> depuis Ship Cove
              {leg ? <><br />{leg}</> : null}
              {snap.dist > 300 ? <><br /><span class="warn">Le point est rattaché au sentier le plus proche ({fmtKm(snap.dist / 1000, "fr", 1)} km).</span></> : null}
            </>
          ) : "Déplace la carte pour placer ton point d'arrivée."}
        </div>
        <button class="bigbtn bigbtn--primary" type="button" disabled={!snap} style={{ marginBottom: 0 }} onClick={() => snap && onPick(snap)}>
          Arrivée ici
        </button>
      </div>
    </div>
  );
}
