import type { GeoJSONSource } from "maplibre-gl";
import { haversine, type LngLat, type Route } from "../lib/geo";
import type { Day } from "../types";
import type { TrailMap } from "./map";

export interface FlyOptions {
  /** total duration (ms); default scales with distance */
  duration?: number;
  zoom?: number;
  pitch?: number;
  /** draw the flown line as it goes (white), as for a day replay */
  draw?: boolean;
  onProgress?: (f: number, km: number) => void;
  onEnd?: () => void;
}

/** The camera follows the trail between two km in 3D. Returns a stop function. */
export function flyAlong(tm: TrailMap, route: Route, k0: number, k1: number, o: FlyOptions = {}): () => void {
  const m = tm.map;
  const end = () => o.onEnd?.();
  const path = route.slice(Math.min(k0, k1), Math.max(k0, k1)).flat();
  if (k1 < k0) path.reverse();
  if (path.length < 2) { end(); return () => {}; }

  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  const at = (d: number): LngLat => {
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    const t = cum[hi] > cum[lo] ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    return [path[lo][0] + (path[hi][0] - path[lo][0]) * t, path[lo][1] + (path[hi][1] - path[lo][1]) * t];
  };
  const look = Math.max(900, Math.min(4000, total / 40));
  const headingAt = (d: number) => {
    const a = at(Math.max(0, d - look * 0.4)), b = at(Math.min(total, d + look));
    const toR = Math.PI / 180;
    const y = Math.sin((b[0] - a[0]) * toR) * Math.cos(b[1] * toR);
    const x = Math.cos(a[1] * toR) * Math.sin(b[1] * toR) - Math.sin(a[1] * toR) * Math.cos(b[1] * toR) * Math.cos((b[0] - a[0]) * toR);
    return (Math.atan2(y, x) / toR + 360) % 360;
  };

  const duration = o.duration ?? Math.min(42000, Math.max(14000, (total / 1000) * 1300));
  const zoom = o.zoom ?? 13.4, pitch = o.pitch ?? 64;
  const src = o.draw ? (m.getSource("replay") as GeoJSONSource | undefined) : undefined;
  let raf = 0, start = 0, stopped = false;
  let bearing = headingAt(0);
  tm.replaying = true;
  document.documentElement.classList.add("is-replaying");

  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    tm.replaying = false;
    document.documentElement.classList.remove("is-replaying");
    src?.setData({ type: "FeatureCollection", features: [] });
    end();
  };

  const frame = (now: number) => {
    if (stopped) return;
    if (!start) start = now;
    const raw = Math.min(1, (now - start) / duration);
    const f = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2; // ease in-out
    const d = f * total;
    const p = at(d);
    const target = headingAt(d);
    const delta = ((target - bearing + 540) % 360) - 180;
    bearing = (bearing + delta * 0.035 + 360) % 360;
    m.jumpTo({ center: p, bearing, pitch, zoom });
    if (src) {
      const drawn: LngLat[] = [];
      for (let i = 0; i < path.length && cum[i] <= d; i++) drawn.push(path[i]);
      drawn.push(p);
      src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: drawn } });
    }
    o.onProgress?.(f, k0 + (k1 - k0) * f);
    if (raw >= 1) { window.setTimeout(finish, 600); return; }
    raf = requestAnimationFrame(frame);
  };

  m.flyTo({ center: path[0], zoom, pitch, bearing, duration: 1800, essential: true });
  m.once("moveend", () => { if (!stopped) raf = requestAnimationFrame(frame); });
  return finish;
}

/** "Replay the day": the camera follows the day's route in 3D while the line draws itself. */
export function replayDay(tm: TrailMap, route: Route, day: Day, onProgress: (f: number) => void, onEnd: () => void): () => void {
  if (day.start_km === null || day.end_km === null) { onEnd(); return () => {}; }
  return flyAlong(tm, route, day.start_km, day.end_km, { draw: true, onProgress: (f) => onProgress(f), onEnd });
}
