import type { Trail } from "../types";

export type LngLat = [number, number];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Move `dist` metres from `p` towards `brg` degrees. */
export function destination(p: LngLat, brg: number, dist: number): LngLat {
  const d = dist / R;
  const t = rad(brg);
  const lat1 = rad(p[1]);
  const lng1 = rad(p[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(t));
  const lng2 = lng1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [deg(lng2), deg(lat2)];
}

interface Part { lng: Float64Array; lat: Float64Array; km: Float64Array }

/** Fast lookups along the official route (km are measured from Ship Cove). */
export class Route {
  parts: Part[];
  total: number;
  trail: Trail;

  constructor(trail: Trail) {
    this.trail = trail;
    this.parts = trail.parts.map((p) => ({
      lng: Float64Array.from(p, (v) => v[0]),
      lat: Float64Array.from(p, (v) => v[1]),
      km: Float64Array.from(p, (v) => v[2]),
    }));
    this.total = trail.total_km;
  }

  private locate(km: number): { part: Part; i: number; t: number } {
    const k = Math.max(0, Math.min(this.total, km));
    let part = this.parts[this.parts.length - 1];
    for (const p of this.parts) {
      if (k <= p.km[p.km.length - 1]) { part = p; break; }
    }
    const a = part.km;
    if (k <= a[0]) return { part, i: 0, t: 0 };
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a[mid] <= k) lo = mid; else hi = mid;
    }
    const span = a[hi] - a[lo];
    return { part, i: lo, t: span > 0 ? (k - a[lo]) / span : 0 };
  }

  pointAt(km: number): LngLat {
    const { part, i, t } = this.locate(km);
    const j = Math.min(i + 1, part.lng.length - 1);
    return [part.lng[i] + (part.lng[j] - part.lng[i]) * t, part.lat[i] + (part.lat[j] - part.lat[i]) * t];
  }

  /** Direction of travel (south-bound) at a given km. */
  bearingAt(km: number, window = 0.6): number {
    const a = this.pointAt(Math.max(0, km - window));
    const b = this.pointAt(Math.min(this.total, km + window));
    return bearing(a, b);
  }

  /** Lines covering [k0, k1] (one line per continuous part). */
  slice(k0: number, k1: number): LngLat[][] {
    const lo = Math.max(0, Math.min(k0, k1));
    const hi = Math.min(this.total, Math.max(k0, k1));
    const out: LngLat[][] = [];
    if (hi - lo < 1e-6) return out;
    for (const p of this.parts) {
      const pk0 = p.km[0], pk1 = p.km[p.km.length - 1];
      if (pk1 < lo || pk0 > hi) continue;
      const a = Math.max(lo, pk0), b = Math.min(hi, pk1);
      if (b - a < 1e-6) continue;
      const line: LngLat[] = [this.pointAt(a === pk0 ? pk0 : a)];
      for (let i = 0; i < p.km.length; i++) {
        if (p.km[i] > a && p.km[i] < b) line.push([p.lng[i], p.lat[i]]);
      }
      line.push(this.pointAt(b));
      // pointAt picks the first part containing km; fix endpoints that fall on a gap boundary
      if (a === pk0) line[0] = [p.lng[0], p.lat[0]];
      if (b === pk1) line[line.length - 1] = [p.lng[p.lng.length - 1], p.lat[p.lat.length - 1]];
      out.push(line);
    }
    return out;
  }

  /** Snap a position onto the route. Returns km along the route and the distance to it. */
  nearest(pt: LngLat): { km: number; dist: number; point: LngLat } {
    const cos = Math.cos(rad(pt[1]));
    const px = pt[0] * cos, py = pt[1];
    let best = { d2: Infinity, km: 0, x: 0, y: 0 };
    for (const p of this.parts) {
      for (let i = 0; i < p.km.length - 1; i++) {
        const ax = p.lng[i] * cos, ay = p.lat[i];
        const bx = p.lng[i + 1] * cos, by = p.lat[i + 1];
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const x = ax + t * dx, y = ay + t * dy;
        const d2 = (px - x) ** 2 + (py - y) ** 2;
        if (d2 < best.d2) best = { d2, km: p.km[i] + t * (p.km[i + 1] - p.km[i]), x, y };
      }
    }
    const point: LngLat = [best.x / cos, best.y];
    return { km: best.km, dist: haversine(pt, point), point };
  }

  bounds(lines: LngLat[][]): [LngLat, LngLat] | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const l of lines) for (const [x, y] of l) {
      if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
  }

  places() { return this.trail.places; }

  /** Previous and next named places around a km. */
  around(km: number) {
    const ps = this.trail.places;
    let prev = ps[0], next = ps[ps.length - 1];
    for (const p of ps) {
      if (p.km <= km + 0.05) prev = p;
      if (p.km > km + 0.05) { next = p; break; }
    }
    return { prev, next };
  }

  legAt(km: number): string | null {
    const legs = this.trail.legs;
    if (!legs) return null;
    for (const l of legs) if (km >= l.k0 - 0.01 && km <= l.k1 + 0.01) return l.n;
    return null;
  }
}

/** Merge overlapping [a, b] km ranges. */
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = ranges.map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number]).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 0.05) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}
