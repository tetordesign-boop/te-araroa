// The film's 3D flight (development tool, not part of the site): the site's night map with its real relief, the
// trail lit in orange as Ewan's point runs it, driven frame by frame from the film's own clock (scripts/film/render3d.mjs).
// Same timeline as the film: the drop at 10 s dives in, the run 11.25 → 16.25 passes each town on a beat, then it
// pulls up to the flat, north-up view the film's 2D map takes over from at 17.5.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle, SKY_NIGHT } from "../map/style";
import trail from "../data/trail-lite.json";
import land from "./nz-land.json";

type P = [number, number, number];
const PARTS = trail.parts as P[][];
const TOTAL = trail.total_km as number;
const place = (n: string) => (trail.places as { n: string; c: [number, number]; km: number }[]).find((p) => p.n.startsWith(n))!;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eio = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const eio5 = (p: number) => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2);

const BEAT = 60 / 96, BAR = 4 * BEAT;
const bt = (bar: number, beat = 0) => (bar - 1) * BAR + beat * BEAT;
const T = { dive: [bt(5, 0), bt(5, 2)], run: [bt(5, 2), bt(7, 2)], pull: [bt(7, 2), bt(8, 0)] };
const KNOTS: [number, number][] = [[T.run[0], 0], [bt(5, 4), 252.2], [bt(6, 1), 494.8], [bt(6, 2), 702.7], [bt(6, 3), 902.8], [bt(7, 0), 994.8], [T.run[1], TOTAL]];
const runKm = (() => {
  const xs = KNOTS.map((k) => k[0]), ys = KNOTS.map((k) => k[1]), n = xs.length;
  const d: number[] = []; for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [0]; for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])); m.push(0);
  return (t: number) => {
    if (t <= xs[0]) return 0; if (t >= xs[n - 1]) return TOTAL;
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (t - xs[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
})();
const kmPoint = (km: number): [number, number] => {
  for (let k = 0; k < PARTS.length; k++) {
    const part = PARTS[k];
    if (km > part[part.length - 1][2] && k < PARTS.length - 1) continue;
    for (let i = 1; i < part.length; i++) {
      const a = part[i - 1], b = part[i];
      if (km <= b[2] || i === part.length - 1) { const p = b[2] > a[2] ? clamp((km - a[2]) / (b[2] - a[2])) : 0; return [lerp(a[0], b[0], p), lerp(a[1], b[1], p)]; }
    }
  }
  return [PARTS[0][0][0], PARTS[0][0][1]];
};
/** the trail up to a km, one line per part (the lake and river transfers stay gaps) */
const walked = (km: number): GeoJSON.Feature => {
  const lines: [number, number][][] = [];
  for (const part of PARTS) {
    if (part[0][2] > km) break;
    const l: [number, number][] = [];
    for (const p of part) { if (p[2] > km) { l.push(kmPoint(km)); break; } l.push([p[0], p[1]]); }
    if (l.length > 1) lines.push(l);
  }
  return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } };
};
const route: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: PARTS.map((p) => p.map((q) => [q[0], q[1]])) } };
const bearingTo = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
};
const angDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;

// the camera: the 2D film's views, in map zooms (px per degree of longitude = 512·2^z / 360)
const zFor = (pxPerDegLon: number) => Math.log2((pxPerDegLon * 360) / 512);
const K = Math.cos((42.5 * Math.PI) / 180);
// two frames: the vertical one (stories, 1080 × 1920) and, with ?wide, the YouTube one (1920 × 1080), the words on the left
const WIDE = new URLSearchParams(location.search).has("wide");
const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
type Cam = { center: [number, number]; zoom: number; pitch: number; bearing: number; top: number; left: number };
/** a 2D view of the film (its centre drawn at cx, cy, s px per degree of latitude) as a map camera: the padding moves the centre */
const view2d = (lon: number, lat: number, s: number, cx: number, cy: number): Cam => ({ center: [lon, lat], zoom: zFor(K * s), pitch: 0, bearing: 0, top: 2 * cy - H, left: 2 * cx - W });
const VIEW_NZ = WIDE ? view2d(172.55, -40.95, 73, 1330, 566) : view2d(172.55, -40.95, 97, 540, 1150);
const VIEW_SI = WIDE ? view2d(171.0, -43.75, 135, 1300, 560) : view2d(171.0, -43.75, 150, 540, 1160);
// (the point rides in the lower part of the frame, the land ahead above it; in the wide frame, right of the words)
const RUN = WIDE ? { zoom: 8.05, zoomEnd: 7.75, pitch: 60, ahead: 0.45, top: 260, left: 480 } : { zoom: 8.05, zoomEnd: 7.75, pitch: 60, ahead: 0.45, top: 620, left: 0 };
// the run's camera on a critically damped spring (centre and heading), precomputed so any frame can be drawn alone
const TRACK = (() => {
  const dt = 1 / 480, out: Cam[] = [];
  const start = kmPoint(0), ahead0 = kmPoint(runKm(T.run[0] + RUN.ahead) + 40);
  let c: [number, number] = [...start] as [number, number], v = [0, 0], brg = bearingTo(start, ahead0), vb = 0;
  for (let t = T.run[0]; t <= T.pull[1] + 0.01; t += dt) {
    const km = runKm(t), target = kmPoint(runKm(t + RUN.ahead));
    const w = 6.5;
    for (let k = 0; k < 2; k++) { const a = w * w * (target[k] - c[k]) - 2 * w * v[k]; v[k] += a * dt; c[k] += v[k] * dt; }
    const head = bearingTo(kmPoint(km), kmPoint(Math.min(TOTAL, km + 70)));
    const wb = 3.2, ab = wb * wb * angDiff(brg, head) - 2 * wb * vb; vb += ab * dt; brg = (brg + vb * dt + 360) % 360;
    out.push({ center: [c[0], c[1]], zoom: lerp(RUN.zoom, RUN.zoomEnd, ramp(t, T.run[0], T.run[1])), pitch: RUN.pitch, bearing: brg, top: RUN.top, left: RUN.left });
  }
  return { dt, out };
})();
const trackAt = (t: number): Cam => TRACK.out[Math.round(clamp((t - T.run[0]) / TRACK.dt, 0, TRACK.out.length - 1))];
const mixCam = (a: Cam, b: Cam, p: number): Cam => ({
  center: [lerp(a.center[0], b.center[0], p), lerp(a.center[1], b.center[1], p)], zoom: lerp(a.zoom, b.zoom, p),
  pitch: lerp(a.pitch, b.pitch, p), bearing: (a.bearing + angDiff(a.bearing, b.bearing) * p + 360) % 360, top: lerp(a.top, b.top, p), left: lerp(a.left, b.left, p),
});
function camAt(t: number): Cam {
  if (t <= T.dive[0]) return VIEW_NZ;
  if (t < T.run[0]) { const s = trackAt(T.run[0]); return mixCam(VIEW_NZ, s, eio5(ramp(t, T.dive[0], T.run[0]))); }
  if (t < T.run[1]) return trackAt(t);
  if (t < T.pull[1]) return mixCam(trackAt(t), VIEW_SI, eio(ramp(t, T.pull[0], T.pull[1])));
  return VIEW_SI;
}

const TOWNS = ["Ship Cove", "St Arnaud", "Arthur's Pass", "Lake Tekapo", "Wānaka", "Queenstown", "Bluff"].map(place);
const zi = (stops: [number, number][]) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()] as unknown as number;
const ORANGE = "#FF6B12";

const style = buildStyle("explore", { dark: true, land: land as GeoJSON.Feature, contours: false, sun: null, sky: SKY_NIGHT });
style.projection = { type: "mercator" };
const map = new maplibregl.Map({
  container: "map", style, center: VIEW_NZ.center, zoom: VIEW_NZ.zoom, interactive: false, attributionControl: false,
  fadeDuration: 0, maxPitch: 75, pixelRatio: 1, canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
});
const ready = new Promise<void>((res) => map.once("load", () => {
  // the film writes its own names: the map's labels go
  for (const l of map.getStyle().layers) if (l.type === "symbol") map.setLayoutProperty(l.id, "visibility", "none");
  if (map.getSource("dem")) map.setTerrain({ source: "dem", exaggeration: 2.0 }); // (not in the offline check)
  const round = { "line-join": "round", "line-cap": "round" } as const;
  const w = (a: number, b: number) => zi([[5, a], [12, b]]);
  map.addSource("route", { type: "geojson", data: route });
  map.addSource("walked", { type: "geojson", data: walked(0) });
  map.addLayer({ id: "route-casing", type: "line", source: "route", layout: round, paint: { "line-color": "rgba(3,8,18,0.7)", "line-width": w(3.6, 6.2) } });
  map.addLayer({ id: "route", type: "line", source: "route", layout: round, paint: { "line-color": "#C3D2EA", "line-width": w(1.7, 2.6), "line-opacity": 0.8 } });
  map.addLayer({ id: "walked-glow", type: "line", source: "walked", layout: round, paint: { "line-color": ORANGE, "line-width": w(12, 24), "line-blur": w(8, 14), "line-opacity": 0.7 } });
  map.addLayer({ id: "walked", type: "line", source: "walked", layout: round, paint: { "line-color": ORANGE, "line-width": w(3.4, 6) } });
  map.addLayer({ id: "walked-core", type: "line", source: "walked", layout: round, paint: { "line-color": "#FFD9BD", "line-width": w(0.9, 1.6), "line-opacity": 0.9 } });
  res();
}));

const idle = () => new Promise<void>((res) => {
  let done = false; const fin = () => { if (!done) { done = true; res(); } };
  map.once("idle", fin); map.triggerRepaint(); setTimeout(fin, 120000);
});
let lastKm = -1;
/** the drawn frame, straight from the map's canvas (a page screenshot would draw it all again) */
(window as unknown as { capture: () => string }).capture = () => map.getCanvas().toDataURL("image/jpeg", 0.94);
/** draws the frame at t (seconds of the film) and tells where the point and the towns land on screen */
(window as unknown as { frame: (t: number) => Promise<unknown> }).frame = async (t: number) => {
  await ready;
  const km = runKm(t);
  if (Math.abs(km - lastKm) > 1e-6) { (map.getSource("walked") as maplibregl.GeoJSONSource).setData(walked(t < T.run[0] ? 0 : km)); lastKm = km; }
  const c = camAt(t);
  map.jumpTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, padding: { top: Math.max(0, c.top), bottom: Math.max(0, -c.top), left: Math.max(0, c.left), right: Math.max(0, -c.left) } });
  await idle();
  const at = (c: [number, number]) => { const p = map.project(c as maplibregl.LngLatLike); return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]; };
  return { t, km, dot: at(kmPoint(km)), towns: TOWNS.map((p) => at(p.c)), cam: map.getZoom() };
};
