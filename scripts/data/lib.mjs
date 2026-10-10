// Shared helpers for the data scripts (run in GitHub Actions, where the open internet is reachable).
export const TRAIL_URL = "https://jmedorwtksxxnzwyjvbz.supabase.co/storage/v1/object/public/site/trail.json";
export const UA = "TeAraroaFollowSite/1.0 (https://tetordesign-boop.github.io/te-araroa/; personal hiking journal)";

export async function loadTrail(src = TRAIL_URL) {
  if (/^https?:/.test(src)) {
    const res = await fetch(src, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`trail ${res.status}`);
    return res.json();
  }
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(src, "utf8"));
}

const R = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;
export function haversine(a, b) {
  const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Nearest point of the trail to p: km along the trail and distance in metres (local equirectangular projection). */
export function makeLocator(trail) {
  const segs = [];
  for (const part of trail.parts) for (let i = 1; i < part.length; i++) segs.push([part[i - 1], part[i]]);
  return (p) => {
    const kx = Math.cos(toRad(p[1])) * 111320, ky = 110540;
    let best = { d2: Infinity, km: 0 };
    for (const [a, b] of segs) {
      const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
      const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy;
      let t = len2 ? -(ax * vx + ay * vy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const x = ax + vx * t, y = ay + vy * t;
      const d2 = x * x + y * y;
      if (d2 < best.d2) best = { d2, km: a[2] + (b[2] - a[2]) * t };
    }
    return { km: Math.round(best.km * 10) / 10, d: Math.round(Math.sqrt(best.d2)) };
  };
}

export function bboxOf(trail, padDeg = 0.25) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const part of trail.parts) for (const [x, y] of part) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w - padDeg, s - padDeg, e + padDeg, n + padDeg];
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
