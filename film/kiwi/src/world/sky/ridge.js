// The ridge of Act 3 (S12 spiral sky, S13/S14 calm): a tussock ridge top running along X, the kiwi at the origin.
// Gentle fall toward the cameras (+Z), a steep drop behind (-Z) into a deep glacial valley, the Alps beyond.
// Shared 3D ground + painted distant landscape (palette per mood) so the three shots sit in the same place.
import * as THREE from "three";
import { rng, clamp, lerp, smooth } from "../../core/time.js";
import { stroke, blob } from "../../core/paint.js";
import { makeNoise, frame, layerLight, paintRange, rangeProfile, mistBand, silhouetteFill, ramp, shade, mix, rgba, smoothstep, cumulus, stratus } from "./kit.js";
import { gridTerrain, axis, tileTexture, mergedRocks, tussockGeometry, instancedClumps, scatter } from "./terrain.js";

const N = makeNoise(41);
/** Ridge surface height (m). */
export function ridgeH(x, z) {
  // crest line along X: flat around the kiwi, a knoll far left, a slow dip right
  const crest = 0.9 * smooth((-x - 4) / 9) + 0.25 * Math.sin(x * 0.21 + 0.6) * smooth((Math.abs(x) - 2) / 4) - 0.25 * smooth((x - 6) / 10);
  // cross-section: gentle toward the camera side (+Z), steep drop behind (-Z)
  const zf = z > 0 ? 0.045 * z * z / (1 + z * 0.12) + 0.06 * z : 0.22 * z * z + 0.09 * Math.abs(z) ** 3;
  // relief: undulations away from the kiwi, millimetre bumps everywhere
  const r0 = Math.hypot(x, z), away = smooth((r0 - 0.6) / 2.5);
  const und = 0.18 * N.fbm(x * 0.18, z * 0.25, 3) * away;
  const bumps = 0.012 * N.fbm(x * 3.1, z * 3.1, 3) + 0.004 * N.n(x * 11, z * 11);
  return crest - zf + und + bumps;
}

/** Tileable ground texture: alpine herbfield / tussock litter / gravel (1 m tile). */
export function ridgeGroundTexture(ctx, pal) {
  return tileTexture(ctx, 1024, 1024, (g, w, h, wrap) => {
    const r = rng(77);
    g.fillStyle = pal.soil; g.fillRect(-24, -24, w + 48, h + 48);
    // big mottling: moss and bare soil patches
    for (let i = 0; i < 140; i++) {
      const x = r() * w, y = r() * h, s = r.range(30, 110), c = r.pick([pal.moss, pal.soilDark, pal.soil, pal.moss2]);
      wrap(x, y, s * 1.4, (X, Y) => { g.globalAlpha = r.range(0.35, 0.7); blob(g, X, Y, s, s * r.range(0.5, 0.9), c, i + 1, 0.4, 14); });
    }
    g.globalAlpha = 1;
    // litter: short straw strokes
    for (let i = 0; i < 5200; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI, len = r.range(10, 34), c = r.pick(pal.straw);
      wrap(x, y, len, (X, Y) => { g.globalAlpha = r.range(0.45, 0.9); stroke(g, X, Y, a, len, r.range(1.5, 3.2), c, 0.8, r); });
    }
    // gravel: small stones with a lit top and a dark underside
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h, s = r.range(3, 11), c = r.pick(pal.stones);
      wrap(x, y, s * 2, (X, Y) => {
        g.globalAlpha = 0.9; blob(g, X, Y + s * 0.25, s * 1.05, s * 0.75, pal.soilDark, i * 3 + 1, 0.3, 10);
        blob(g, X, Y, s, s * 0.7, c, i * 3 + 2, 0.3, 10); g.globalAlpha = 0.7; blob(g, X - s * 0.2, Y - s * 0.25, s * 0.5, s * 0.3, shade(c, 0.25), i * 3 + 3, 0.3, 8);
      });
    }
    g.globalAlpha = 1;
  }, { r: 2, paper: 0.06 });
}

/**
 * Build the 3D ridge: ground, tussock clumps, stones. opts: pal (colours), detail ("foot" adds dense grit), clear
 * (extra keep-out discs [x,z,r]), tussockN. Returns {group, heightAt, colliders, tussock, dispose}.
 */
export function buildRidge(ctx, o = {}) {
  const { celMaterial, inkable } = ctx;
  const pal = o.pal;
  const group = new THREE.Group(); group.name = "ridge";
  const disposers = [];
  const tex = ridgeGroundTexture(ctx, pal.ground); disposers.push(tex.dispose);
  const xs = axis(-34, 34, 0, o.detail === "foot" ? 0.02 : 0.04, 1.07, 2.5), zs = axis(-16, 30, 0, o.detail === "foot" ? 0.02 : 0.04, 1.07, 2.5);
  const groundMat = celMaterial({ color: pal.groundTint ?? "#ffffff", map: tex.texture, thresh: -0.35, rim: 0.15, shade: 0.75 });
  const T = gridTerrain(ctx, { xs, zs, h: ridgeH, material: groundMat, tile: 1.0, name: "ground" });
  group.add(T.mesh);
  const heightAt = T.heightAt;
  // keep-out zones: the kiwi's feet / step, the camera paths and the lines of sight
  const clear = [[0, 0, 0.32], [0.16, 0.06, 0.2], ...(o.clear ?? [])];
  const segs = o.sight ?? [];        // [[x0,z0,x1,z1,width]] corridors
  const segD = (x, z, [ax, az, bx, bz]) => { const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz; const k = clamp(((x - ax) * vx + (z - az) * vz) / l); return Math.hypot(x - ax - vx * k, z - az - vz * k); };
  const free = (x, z, pad = 0) => clear.every(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) > cr + pad) && segs.every((s) => segD(x, z, s) > s[4] + pad);
  // tussock
  const tgeo = [0, 1, 2].map((i) => tussockGeometry(11 + i * 7, { blades: 90, spread: 0.6, droop: 0.75, width: 0.03 }));
  const tussock = [];
  const gmap = (c) => { const n = 64, d = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { const k = i / (n - 1); const col = new THREE.Color(mix(shade(c, -0.6), mix(c, shade(c, 0.28), smoothstep(0.55, 1, k)), smoothstep(0.0, 0.45, k))); d.set([col.r * 255, col.g * 255, col.b * 255, 255], i * 4); }
    const t = new THREE.DataTexture(d, 1, n); t.needsUpdate = true; t.magFilter = THREE.LinearFilter; disposers.push(() => t.dispose()); return t; };
  const tusMat = celMaterial({ color: "#ffffff", map: gmap(pal.tussock), side: THREE.DoubleSide, thresh: -0.3, rim: 0.22, shade: 0.8 });
  const tusMat2 = celMaterial({ color: "#ffffff", map: gmap(pal.tussock2), side: THREE.DoubleSide, thresh: -0.3, rim: 0.22, shade: 0.8 });
  const near = scatter(5, o.tussockN ?? 140, [-9, 9, -2.2, 6], {
    keep: (x, z, r) => free(x, z, 0.12) && r() < 0.35 + 0.65 * smooth((Math.hypot(x, z) - 0.4) / 1.2) && z > -1.6 + 0.1 * Math.abs(x) * 0.2,
    dist: (x, z) => 0.18 + 0.12 * Math.hypot(x, z),
  });
  const far = scatter(6, 220, [-30, 30, -3, 24], { keep: (x, z) => free(x, z, 0.4) && Math.hypot(x, z) > 6, dist: () => 1.1 });
  const items = [...near, ...far].map((p) => ({ x: p.x, z: p.z, s: (0.2 + 0.24 * p.u) * (1 + 0.5 * smooth((Math.hypot(p.x, p.z) - 3) / 10)), rot: p.v * 6.283, sy: 0.85 + 0.3 * p.u, sx: 1 }));
  const byG = [[], [], []]; items.forEach((it, i) => byG[i % 3].push(it));
  const clumps = byG.map((list, i) => instancedClumps(tgeo[i], i === 1 ? tusMat2 : tusMat, list, heightAt, { name: `tussock${i}` }));
  for (const c of clumps) { group.add(c.mesh); tussock.push(c); }
  // stones: a few bigger rocks + many small ones near the kiwi
  const rockMat = celMaterial({ color: pal.rock, thresh: 0.0, rim: 0.5, shade: 0.9 });
  const pebbleMat = celMaterial({ color: pal.pebble, thresh: -0.2, rim: 0.4, shade: 0.55 });
  const bigs = scatter(8, 26, [-14, 14, -2, 12], { keep: (x, z) => free(x, z, 0.6) && Math.hypot(x, z) > 1.4, dist: () => 1.2 }).map((p) => ({ x: p.x, z: p.z, s: 0.15 + 0.35 * p.u * p.u, sy: 0.7 + 0.5 * p.v }));
  const smalls = scatter(9, o.detail === "foot" ? 260 : 120, [-2.5, 2.5, -0.8, 2.6], { keep: (x, z) => free(x, z, -0.12) && Math.hypot(x - 0.16, z - 0.06) > 0.12 && Math.hypot(x, z) > 0.1, dist: () => 0.05 }).map((p) => ({ x: p.x, z: p.z, s: 0.012 + 0.035 * p.u * p.u * p.u, sy: 0.6 + 0.4 * p.v, sink: 0.25 }));
  const rocks = mergedRocks(ctx, bigs, rockMat, { seed: 3, heightAt, name: "rocks" });
  const pebbles = mergedRocks(ctx, smalls, pebbleMat, { seed: 4, heightAt, name: "pebbles", detail: 0 });
  inkable(rocks); inkable(pebbles);
  group.add(rocks, pebbles);
  return {
    group, heightAt, colliders: [T.mesh, rocks], tussock: clumps, ground: T.mesh,
    dispose() { disposers.forEach((d) => d()); },
  };
}

/** Tussock bend from a radial wave (shockwave) + a gentle breeze. Returns bend(item) for instancedClumps.pose. */
export function tussockBend(t, { wave, breeze = 0.04 } = {}) {
  return (it) => {
    let bx = breeze * (0.6 + 0.4 * Math.sin(t * 2.1 + it.x * 1.7 + it.z)), bz = breeze * 0.3 * Math.sin(t * 1.7 + it.z * 2.3);
    if (wave) {
      const dx = it.x - wave.x, dz = it.z - wave.z, d = Math.hypot(dx, dz) + 1e-4, u = t - wave.t;
      if (u > 0) {
        const front = u * wave.speed, k = d - front;                         // < 0 behind the front
        const env = Math.exp(-Math.max(0, -k) / (wave.len ?? 0.9)) * Math.exp(-d / (wave.reach ?? 5));
        const push = k < 0.08 ? wave.amp * env * Math.cos(Math.max(0, -k) * (wave.freq ?? 9)) * smoothstep(0.08, -0.05, k) : 0;
        bx += (dx / d) * push; bz += (dz / d) * push;
      }
    }
    return [bx, bz];
  };
}

// ------------------------------------------------------------------ painted landscape beyond the ridge
// Everything is placed by world azimuth / elevation from the layer's mean camera (see kit.frame), so the same peaks
// stand in the same place in S12, S13 and S14.
const ALPS = rangeProfile({
  base: 2.9, amp: 2.0, wave: 6, seed: 12, sharp: 0.8, jag: 0.3,
  peaks: [{ az: -56, el: 7.5, w: 12, wr: 8 }, { az: -34, el: 5.4, w: 7 }, { az: -19, el: 8.6, wl: 9, wr: 6, pow: 1.3 }, { az: 6, el: 5.8, w: 8 },
    { az: 24, el: 9.6, wl: 7, wr: 11, pow: 1.3 }, { az: 46, el: 6.0, w: 9 }, { az: -80, el: 5.5, w: 12 }],
});
// valley walls converge toward the sun's azimuth: a V that leads the eye into the sky
const vee = (az, c, k) => Math.abs(az - c) * k;
const _SB = rangeProfile({ base: 0, amp: 2.6, wave: 4, seed: 19, sharp: 0.7, jag: 0.15 });
const _SF = rangeProfile({ base: 0, amp: 2.2, wave: 5, seed: 23, sharp: 0.6, jag: 0.1 });
const SPURS_B = (az) => 1.0 + vee(az, -6, 0.11) + _SB(az) + 2.2 * Math.max(0, 1 - Math.abs(az + 30) / 10) ** 1.3 + 1.6 * Math.max(0, 1 - Math.abs(az - 20) / 8) ** 1.3;
const SPURS_F = (az) => -1.6 + vee(az, 2, 0.15) + _SF(az) + 2.4 * Math.max(0, 1 - Math.abs(az - 30) / 12) ** 1.3 + 1.8 * Math.max(0, 1 - Math.abs(az + 42) / 10) ** 1.3;
const SHOULDER = (az) => -3.8 + vee(az, -10, 0.12) + 1.6 * N.fbm(az / 5, 2.2, 3) + 0.7 * N.ridged(az / 1.8, 1.1, 3);
export const SUN_AZ = { spiral: -3.9, calm: 21.8 };

/** Palettes per mood. */
export const RIDGE_PAL = {
  calm: {
    alps: { lit: "#DDB1AA", mid: "#B596B2", shade: "#8A7FB0", deep: "#776EA4", snowLit: "#EFCDBE", snowMid: "#D6B6BE", snowShade: "#AFA2D2", haze: "#D3ADBA", rim: "#FFEBCB" },
    spursB: { lit: "#C49AAE", mid: "#A487AE", shade: "#8576A6", deep: "#776BA0", haze: "#CDA9BA", rim: "#FBD4B6" },
    spurs: { lit: "#9C82A6", mid: "#7F6E9E", shade: "#635A8E", deep: "#554E85", haze: "#B596B4", rim: "#F6C9A8" },
    shoulder: { lit: "#7C6A7C", mid: "#615574", shade: "#4C4468", deep: "#40395E", haze: "#9C86A8", rim: "#F8C49C" },
    mist: "#F0BDA8", mist2: "#CFA3B8",
    ground: { soil: "#5E5642", soilDark: "#3F3A33", moss: "#5F6440", moss2: "#6E6A3E", straw: ["#B8955A", "#C8A468", "#8F7448", "#D2B27A"], stones: ["#8C8794", "#77737F", "#9C958F"] },
    tussock: "#C4A266", tussock2: "#AC8D58", rock: "#8A8590", pebble: "#8E8890", groundTint: "#FFFFFF",
  },
  spiral: {
    alps: { lit: "#9A80C2", mid: "#7660AE", shade: "#4F4296", deep: "#41368A", snowLit: "#D9BCD9", snowMid: "#A994D0", snowShade: "#7466B6", haze: "#7E66B8", rim: "#FFDDB0" },
    spursB: { lit: "#7A64AE", mid: "#62529E", shade: "#4C418C", deep: "#413884", haze: "#6E5AAE", rim: "#FFD3A0" },
    spurs: { lit: "#5C4C9C", mid: "#493D8A", shade: "#372F76", deep: "#2D2768", haze: "#5E4CA2", rim: "#FFC98F" },
    shoulder: { lit: "#40366E", mid: "#342C62", shade: "#282350", deep: "#211C46", haze: "#4A3F86", rim: "#FFB98A" },
    mist: "#9277C8", mist2: "#6A55AC",
    ground: { soil: "#4E4740", soilDark: "#332F2E", moss: "#4C5038", moss2: "#5B5638", straw: ["#A8865A", "#B89464", "#7F6648", "#C29E72"], stones: ["#7C7788", "#686476", "#8C8584"] },
    tussock: "#A08A62", tussock2: "#8C7752", rock: "#7A7488", pebble: "#827B88", groundTint: "#FFFFFF",
  },
};

/** Broken mist lying at the foot of a silhouette: short soft strokes, denser in the dips. */
function valleyMist(g, L, F, top, { color, seed, n, h, alpha = [0.08, 0.22] }) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * L.w, t = top(x), dip = smoothstep(-2, 1.5, (t - top(x - 3 * F.ppd) + t - top(x + 3 * F.ppd)) / F.ppd);
    if (r() > 0.25 + 0.75 * dip) continue;
    g.globalAlpha = r.range(...alpha);
    stroke(g, x, t + r.range(0.2, 1.2) * h, r.gauss() * 0.02, r.range(2, 7) * F.ppd, r.range(0.25, 0.6) * h, color, 0.9, r);
  }
  g.globalAlpha = 1;
}

/** The far layers: alps (snowy peaks), spurs (two receding ridgelines with mist), shoulder (near valley side). */
export function ridgeLayers(mood, { quality = 0.7, blur = 0 } = {}) {
  const P = RIDGE_PAL[mood], back = mood === "spiral";
  const lightAt = (F) => (px) => { const d = (SUN_AZ[mood] - F.azAt(px)) / 14; return [clamp(d, -1, 1) * 0.85, 0.42, back ? 0.05 : 0.25]; };
  return [
    {
      name: "alps", depth: 1400, quality, blur, brush: { r: 3, paper: 0.06 }, flash: 0.3,
      paint(g, L, ctx) {
        const F = frame(L);
        const top = (px) => F.rowAt(px, ALPS(F.azAt(px)));
        const hor = F.rowAt(L.w / 2, 0);
        paintRange(g, L, {
          top, bottom: L.h, pal: P.alps, lightAt: lightAt(F), seed: 21, scale: 9 * F.ppd, f: 3, strokes: 1, rimW: 3, rimAll: back,
          snow: (px, py, d, up) => (py < F.rowAt(px, 3.0 + 1.4 * N.n(px / (F.ppd * 3), 1)) && up > 0.0 ? 1 : 0) + (py < F.rowAt(px, 5.2) ? 1 : 0),
          haze: (px, py, d) => 0.08 + 0.8 * smoothstep(F.rowAt(px, 3.5), hor + 1.5 * F.ppd, py), thresh: [0.2, 0.52],
        });
      },
    },
    {
      name: "spurs", depth: 420, quality, blur, brush: { r: 3, paper: 0.06 }, flash: 0.35,
      paint(g, L, ctx) {
        const F = frame(L);
        const topB = (px) => F.rowAt(px, SPURS_B(F.azAt(px))), topF = (px) => F.rowAt(px, SPURS_F(F.azAt(px)));
        valleyMist(g, L, F, (px) => F.rowAt(px, 1.2), { color: P.mist, seed: 3, n: 160, h: 1.2 * F.ppd, alpha: [0.05, 0.14] });
        paintRange(g, L, {
          top: topB, bottom: L.h, pal: P.spursB, lightAt: lightAt(F), seed: 33, scale: 7 * F.ppd, f: 3, strokes: 1, rimW: 2, rimAll: back,
          haze: (px, py) => 0.25 + 0.6 * smoothstep(topB(px) + 0.8 * F.ppd, topB(px) + 3.5 * F.ppd, py), thresh: [0.22, 0.55],
        });
        valleyMist(g, L, F, (px) => topF(px) - 1.6 * F.ppd, { color: P.mist, seed: 4, n: 220, h: 1.2 * F.ppd, alpha: [0.06, 0.16] });
        paintRange(g, L, {
          top: topF, bottom: L.h, pal: P.spurs, lightAt: lightAt(F), seed: 35, scale: 4 * F.ppd, f: 3, strokes: 1.1, rimW: 2, rimAll: back, ribs: 1.4,
          haze: (px, py) => 0.05 + 0.5 * smoothstep(topF(px) + 1.5 * F.ppd, topF(px) + 5 * F.ppd, py), thresh: [0.24, 0.58],
        });
        valleyMist(g, L, F, (px) => topF(px) + 2.6 * F.ppd, { color: P.mist2, seed: 5, n: 160, h: 0.9 * F.ppd, alpha: [0.06, 0.16] });
      },
    },
    {
      name: "shoulder", depth: 130, quality: quality * 0.9, blur, brush: { r: 3, paper: 0.06 }, flash: 0.4,
      paint(g, L, ctx) {
        const F = frame(L);
        const top = (px) => F.rowAt(px, SHOULDER(F.azAt(px)));
        paintRange(g, L, {
          top, bottom: L.h, pal: P.shoulder, lightAt: lightAt(F), seed: 45, scale: 3.5 * F.ppd, f: 3, strokes: 1.2, rimW: 2.5, rimAll: back, ribs: 1.3,
          haze: (px, py) => 0.05 + 0.35 * smoothstep(top(px) + 2 * F.ppd, top(px) + 8 * F.ppd, py), thresh: [0.26, 0.6],
        });
      },
    },
  ];
}
