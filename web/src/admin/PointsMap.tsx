// The map of "Ma position": the points received, the trail, the last one in orange. Its own module so the Carnet
// only loads the map engine when this page (or the place picker) opens: the Carnet starts lighter.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "preact/hooks";
import { OFFLINE_MAP } from "../config";
import type { LngLat } from "../lib/geo";
import { buildStyle } from "../map/style";
import type { Pos } from "./Positions";
import { adminRoute, adminSettings } from "./server";

export function PointsMap({ list }: { list: Pos[] }) {
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
      const m = new maplibregl.Map({ container: el.current, style, center: first, zoom: 11, attributionControl: { compact: true }, maxPitch: 0, dragRotate: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
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
