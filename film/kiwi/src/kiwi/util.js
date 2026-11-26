// Kiwi helpers: small array-vector math, a dynamic tube builder (legs, neck, beak, laces, straps) and a parametric
// grid-surface builder with numeric normals (body, head, boots, pack, beanie...). Pure, no state.
import * as THREE from "three";

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, k) => a + (b - a) * k;
export const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
export const smoother = (k) => { k = clamp(k); return k * k * k * (k * (k * 6 - 15) + 10); };
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const L3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const rotX = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
export const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
export const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
/** three.js Euler order "YXZ" (R = Ry Rx Rz) applied to v; e = [x(pitch), y(yaw), z(roll)]. */
export const eul = (v, e) => rotY(rotX(rotZ(v, e[2]), e[0]), e[1]);
/** Rotate v about a unit axis k by angle a (Rodrigues). */
export const rotAxis = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), d = dot3(k, v), x = cross3(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; };
/** Impulse response of a damped spring (0 at u=0, rings, decays). */
export const ring = (u, freq = 3, zeta = 0.35) => (u <= 0 ? 0 : Math.exp(-zeta * 2 * Math.PI * freq * u) * Math.sin(2 * Math.PI * freq * Math.sqrt(1 - zeta * zeta) * u));
export const backOut = (k, s = 1.7) => { k = clamp(k) - 1; return k * k * ((s + 1) * k + s) + 1; };
export const easeOut = (k) => 1 - (1 - clamp(k)) ** 3;
export const bez2 = (a, b, c, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]]; };

/** Unit direction, poles on +-Z (a=0 front), seam at the bottom (-Y). */
export const dirZ = (a, b) => { const th = Math.PI * a, ph = 2 * Math.PI * b - Math.PI / 2; return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]; };
/** Unit direction, poles on +-Y (a=0 top), seam at -Z. */
export const dirY = (a, b) => { const th = Math.PI * a, ph = 2 * Math.PI * b - Math.PI / 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
/** Superellipsoid deformation of a unit direction (e < 1 = boxier). */
export const sup = (d, e) => d.map((x) => Math.sign(x) * Math.pow(Math.abs(x), e));

/**
 * Grid surface: fn(a, b) -> [x,y,z] for a,b in [0,1]. Normals by central differences of fn (smooth even where the
 * grid is coarse), oriented outward from `center`. disp(a,b,p,n) -> metres pushed along n (silhouette detail that
 * does not change the shading normals). uv(a,b) -> [u,v].
 */
export function gridGeo(nA, nB, fn, { center = [0, 0, 0], disp = null, uv = (a, b) => [b, 1 - a], nMix = 0 } = {}) {
  const N = (nA + 1) * (nB + 1), pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uvs = new Float32Array(N * 2);
  const e = 1e-3; let sgnSum = 0; const tmpN = [];
  for (let i = 0; i <= nA; i++) for (let j = 0; j <= nB; j++) {
    const a = i / nA, b = j / nB, k = i * (nB + 1) + j;
    const p = fn(a, b), aa = clamp(a, 3 * e, 1 - 3 * e);
    const n = norm3(cross3(sub3(fn(aa + e, b), fn(aa - e, b)), sub3(fn(aa, b + e), fn(aa, b - e))));
    sgnSum += dot3(n, sub3(p, center)); tmpN.push(n);
    pos.set(p, k * 3); const t = uv(a, b); uvs[k * 2] = t[0]; uvs[k * 2 + 1] = t[1];
  }
  const sg = sgnSum >= 0 ? 1 : -1;
  for (let k = 0; k < N; k++) {
    const n = mul3(tmpN[k], sg); nor.set(n, k * 3);
    if (disp) { const i = Math.floor(k / (nB + 1)), j = k % (nB + 1); const d = disp(i / nA, j / nB, [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]], n); pos[k * 3] += n[0] * d; pos[k * 3 + 1] += n[1] * d; pos[k * 3 + 2] += n[2] * d; }
  }
  const idx = [];
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
    const a = i * (nB + 1) + j, b = (i + 1) * (nB + 1) + j, c = a + 1, d = b + 1;
    if (sg > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  if (nMix > 0) { const g2 = g.clone(); g2.computeVertexNormals(); const a2 = g2.attributes.normal.array; for (let k = 0; k < N; k++) { const n = norm3(L3([nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]], [a2[k * 3], a2[k * 3 + 1], a2[k * 3 + 2]], nMix)); nor.set(n, k * 3); } g2.dispose(); }
  g.computeBoundingSphere();
  return g;
}

/** Lathe as a grid surface: prof(a) -> [r, y], radial(phi, a, y) -> radius multiplier. Axis = Y. */
export function latheGeo(nA, nB, prof, radial = () => 1, opts = {}) {
  return gridGeo(nA, nB, (a, b) => { const [r, y] = prof(a), ph = 2 * Math.PI * b, m = radial(ph, a, y); return [r * m * Math.cos(ph), y, -r * m * Math.sin(ph)]; }, { center: opts.center ?? [0, opts.cy ?? 0, 0], uv: (a, b) => [b, a], ...opts });
}

/** Resample a polyline profile [[r,y],...] by arc length with Catmull-Rom smoothing -> fn(a) -> [r,y]. */
export function profileFn(pts, n = 64) {
  const sm = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 8; k++) { const t = k / 8, t2 = t * t, t3 = t2 * t; sm.push([0, 1].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))); }
  }
  sm.push(pts[pts.length - 1]);
  const acc = [0]; for (let i = 1; i < sm.length; i++) acc.push(acc[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]));
  const tot = acc[acc.length - 1];
  return (a) => { const s = clamp(a) * tot; let i = 1; while (i < acc.length - 1 && acc[i] < s) i++; const k = (s - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1); return [lerp(sm[i - 1][0], sm[i][0], k), lerp(sm[i - 1][1], sm[i][1], k)]; };
}

/** Polyline helpers. */
export function resample(P, n) {
  const acc = [0]; for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + len3(sub3(P[i], P[i - 1])));
  const tot = acc[acc.length - 1] || 1e-9, out = []; let j = 1;
  for (let i = 0; i < n; i++) { const s = (i / (n - 1)) * tot; while (j < P.length - 1 && acc[j] < s) j++; const k = (s - acc[j - 1]) / ((acc[j] - acc[j - 1]) || 1); out.push(L3(P[j - 1], P[j], clamp(k))); }
  return out;
}
export function smoothPts(P, iters = 2, k = 0.5) {
  let A = P.map((p) => p.slice());
  for (let it = 0; it < iters; it++) { const B = A.map((p) => p.slice()); for (let i = 1; i < A.length - 1; i++) for (let c = 0; c < 3; c++) B[i][c] = lerp(A[i][c], (A[i - 1][c] + A[i + 1][c]) / 2, k); A = B; }
  return A;
}

/**
 * Tube along n points with per-point radii, rounded caps, optional flat (ribbon) cross-section. Rewritten in place by
 * set() so it can be animated every frame. Frames: parallel transport from `up`, or per-point `ups` (strap normals).
 */
export class Tube {
  constructor(n, { radial = 12, capA = 3, capB = 3 } = {}) {
    Object.assign(this, { n, radial, capA, capB });
    const rings = capA + n + capB, R1 = radial + 1; this.rings = rings; this.R1 = R1;
    this.pos = new Float32Array(rings * R1 * 3); this.nor = new Float32Array(rings * R1 * 3);
    const uv = new Float32Array(rings * R1 * 2), idx = [];
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) { const a = i * R1 + j, b = a + 1, c = a + R1, d = c + 1; idx.push(a, b, c, b, d, c); }
    for (let i = 0; i < rings; i++) { const v = clamp((i - capA) / Math.max(1, n - 1)); for (let j = 0; j < R1; j++) { uv[(i * R1 + j) * 2] = j / radial; uv[(i * R1 + j) * 2 + 1] = v; } }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geometry = g;
  }
  set(P, R, { up = [0, 1, 0], ups = null, flat = 1 } = {}) {
    const n = this.n, T = [], Nn = [], Bn = [];
    for (let i = 0; i < n; i++) T.push(norm3(sub3(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)])));
    for (let i = 0; i < n; i++) {
      let ref = ups ? ups[i] : i === 0 ? up : Nn[i - 1];
      let N = sub3(ref, mul3(T[i], dot3(ref, T[i])));
      if (len3(N) < 1e-6) N = cross3(T[i], Math.abs(T[i][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
      N = norm3(N); Nn.push(N); Bn.push(cross3(T[i], N));
    }
    const pos = this.pos, nor = this.nor, rad = this.radial, R1 = this.R1;
    let ring = 0;
    const write = (c, r, Ti, Ni, Bi, cosA, sinA) => {
      for (let j = 0; j <= rad; j++) {
        const th = (2 * Math.PI * j) / rad, cs = Math.cos(th), sn = Math.sin(th), k = (ring * R1 + j) * 3;
        pos[k] = c[0] + (Ni[0] * cs * flat + Bi[0] * sn) * r; pos[k + 1] = c[1] + (Ni[1] * cs * flat + Bi[1] * sn) * r; pos[k + 2] = c[2] + (Ni[2] * cs * flat + Bi[2] * sn) * r;
        let nn = norm3([Ni[0] * cs / flat + Bi[0] * sn, Ni[1] * cs / flat + Bi[1] * sn, Ni[2] * cs / flat + Bi[2] * sn]);
        nn = [nn[0] * cosA + Ti[0] * sinA, nn[1] * cosA + Ti[1] * sinA, nn[2] * cosA + Ti[2] * sinA];
        nor[k] = nn[0]; nor[k + 1] = nn[1]; nor[k + 2] = nn[2];
      }
      ring++;
    };
    for (let c = 0; c < this.capA; c++) { const al = ((this.capA - c) / this.capA) * Math.PI / 2; write(add3(P[0], T[0], -R[0] * Math.sin(al) * (flat < 1 ? 0.5 : 1)), R[0] * Math.cos(al), mul3(T[0], -1), Nn[0], Bn[0], Math.cos(al), Math.sin(al)); }
    for (let i = 0; i < n; i++) write(P[i], R[i], T[i], Nn[i], Bn[i], 1, 0);
    for (let c = 1; c <= this.capB; c++) { const al = (c / this.capB) * Math.PI / 2; write(add3(P[n - 1], T[n - 1], R[n - 1] * Math.sin(al) * (flat < 1 ? 0.5 : 1)), R[n - 1] * Math.cos(al), T[n - 1], Nn[n - 1], Bn[n - 1], Math.cos(al), Math.sin(al)); }
    this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.normal.needsUpdate = true;
    return this;
  }
}
