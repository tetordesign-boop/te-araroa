// FLOOD (FX). spec {t, seed}. The river in flood surges (foam streaks racing downstream, toward +Z); a wave rears up
// behind the swing bridge, its lip curls over, and on `t` it slams onto the back edge of the deck and explodes: cel
// foam billows and two-tone droplets are thrown across the bridge and the frame toward the camera, then the wave body
// collapses back into the river. The kiwi stays dry. The wave is a cel-shaded, ink-lined swept surface rebuilt every
// drawing from a closed-form profile (pure function of t, on twos). Water level from world/river.js (RIVER_Y).
import * as THREE from "three";
import { Sprites, Puffs, h1, smooth, camBasis } from "./_lib.js";

const NX = 40, NV = 20;

export default {
  async create(ctx, spec) {
    let Y = -2.2;
    try { const m = await import("../world/river.js"); if (Number.isFinite(m.RIVER_Y)) Y = m.RIVER_Y; } catch (e) { /* keep default */ }
    const group = new THREE.Group(); group.name = "fx:flood";
    const T0 = spec.t, seed = spec.seed ?? 2, rig = ctx.rig;
    const water = new THREE.Color("#2E4C50").lerp(new THREE.Color(rig.key.color), 0.18);
    const foamCol = new THREE.Color("#F4FAFA").lerp(new THREE.Color(rig.key.color), 0.12);
    const dropCol = new THREE.Color("#D8ECEE");
    // wave surface
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(NX * NV * 3); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(NX * NV * 2), 2));
    const idx = []; for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NV - 1; j++) { const a = i * NV + j, b = a + NV; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    geo.setIndex(idx);
    const mat = ctx.celMaterial({ color: water, side: THREE.DoubleSide, thresh: 0.25, hi: 0.5, rim: 1.3 });
    const wave = new THREE.Mesh(geo, mat); wave.frustumCulled = false; wave.name = "flood-wave"; ctx.inkable(wave);
    const foam = new Puffs(ctx, { max: 260, thresh: 0.18, hi: 0.5, seed: seed + 3, lump: 0.22, name: "flood-foam" });
    const drops = new Sprites(ctx, { max: 900, flash: 0.3, fog: 0.2, renderOrder: 26, name: "flood-drops" });
    const surf = new Sprites(ctx, { max: 500, flash: 0.3, fog: 0.6, renderOrder: 12, name: "flood-surf" });
    group.add(wave, foam.mesh, drops.mesh, surf.mesh);
    const deckY = (x) => 0.01 * x * x;
    const v2 = (z, y) => [z, y];
    const bz = (a, b, c, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c;

    /** Profile (z, y) points of the wave at column x, time τ relative to the smash there. Also returns the lip curve. */
    function profile(x, tau) {
      const r = smooth((tau + 1.05) / 0.95), c = smooth((tau + 0.5) / 0.45), s = smooth(tau / 0.2), k = smooth((tau - 0.12) / 0.75);
      const nx = x / 4.5, hn = 1 + 0.14 * Math.sin(x * 1.7 + seed) + 0.08 * Math.sin(x * 3.9);
      const Hh = (0.35 + 3.3 * r) * (1 - 0.9 * k) * hn * (1 - 0.55 * nx * nx);
      const zc = -3.6 + 2.0 * r + 0.35 * s, Yc = Y + Hh;
      const C = v2(zc, Yc);
      const T0p = [zc + 0.3, Yc - 0.25], T1p = [zc + 1.05, Yc - 0.95 * Math.min(1, Hh / 2.5)], T2p = [-0.36, deckY(x) + 0.08 - 2.2 * k];
      const Tp = [T0p[0] + (T1p[0] - T0p[0]) * c, T0p[1] + (T1p[1] - T0p[1]) * c]; Tp[0] += (T2p[0] - Tp[0]) * s; Tp[1] += (T2p[1] - Tp[1]) * s;
      const K = [zc + 0.3 + 0.75 * c + 0.4 * s, Yc + 0.22 * c - 0.15 * s];
      const lip = []; for (let q = 1; q <= 7; q++) { const u = q / 7; lip.push([bz(C[0], K[0], Tp[0], u), bz(C[1], K[1], Tp[1], u)]); }
      const pts = [
        [zc - 3.2, Y - 0.25], [zc - 2.0, Y + 0.18 * Hh], [zc - 1.1, Y + 0.6 * Hh], [zc - 0.4, Y + 0.93 * Hh], C, ...lip,
        [Tp[0] - 0.12 - 0.05 * Hh, Tp[1] + 0.05 * Hh], [zc + 0.25 + 0.1 * Hh, Yc - 0.5 * Hh], [zc + 0.35 + 0.12 * Hh, Y + 0.25 * Hh], [zc + 0.6 + 0.2 * Hh, Y - 0.25],
      ];
      while (pts.length < NV) pts.push(pts[pts.length - 1]);
      return { pts, lip, Tp, r, c, s, k, Hh };
    }
    const tauAt = (x, t) => t - (T0 + 0.05 * (x + 1));
    return {
      object: group,
      update(t, t2, ctx) {
        foam.begin(); drops.begin(ctx); surf.begin(ctx);
        // ---- the wave body
        let any = false;
        for (let i = 0; i < NX; i++) {
          const x = -4.6 + 9.2 * (i / (NX - 1));
          const P = profile(x, tauAt(x, t2));
          for (let j = 0; j < NV; j++) { const [z, y] = P.pts[j]; pos.set([x, y, z], (i * NV + j) * 3); }
          if (P.Hh > 0.4) any = true;
          // foam lacing: white strokes down the back of the crest and along the lip
          if (i % 3 === 1 && P.r > 0.2 && P.k < 0.8) {
            const lace = (a, b, al) => drops.add([x, b[1], b[0]], [0, b[1] - a[1], b[0] - a[0]], 0.012, 1.4, foamCol, al, 0, 0, 0, 0.3);
            lace(P.pts[2], P.pts[3], 0.7 * P.r); lace(P.pts[3], P.pts[4], 0.9 * P.r);
            for (let q = 0; q < 6; q += 2) lace(P.lip[q], P.lip[q + 1], 0.8 * P.c);
          }
          // crest foam along the lip
          if (i % 2 === 0 && P.c > 0.02 && P.k < 0.95) for (let q = 2; q < 7; q += 2) {
            const [z, y] = P.lip[q]; const rr = (0.1 + 0.1 * h1(i, q, seed)) * P.c * (1 - P.k) * (1 + 0.6 * P.s);
            foam.add([x + (h1(i, q, 2) - 0.5) * 0.2, y + rr * 0.3, z], rr, foamCol, h1(i, q, 3) * 6 + t2);
          }
        }
        geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
        wave.visible = true;
        // ---- the smash: foam billows and droplets thrown across the bridge toward the camera
        const a0 = t2 - T0;
        if (a0 > -0.05) {
          for (let i = 0; i < 120; i++) {
            const R = (k) => h1(i + seed * 500, k, 7);
            const ox = (R(1) - 0.5) * 6, a = t2 - (T0 + 0.05 * (ox + 1)); if (a < 0) continue;
            const vx = (R(2) - 0.5) * 2.5, vy = 2.5 + 3.5 * R(3), vz = 1.0 + 4.0 * R(4) * R(4);
            const d = (1 - Math.exp(-a * 2.6)) / 2.6;
            const px = ox + vx * d, py = deckY(ox) + 0.1 + vy * d - 0.9 * a * a, pz = -0.36 + vz * d;
            const r0 = 0.12 + 0.22 * R(5);
            const rr = r0 * (0.3 + 1.1 * (1 - Math.exp(-a * 6))) * (1 - smooth((a - 0.35 - 0.4 * R(6)) / 0.45));
            if (py < Y) continue;
            foam.add([px, py, pz], rr, foamCol, R(7) * 6 + a);
          }
          for (let i = 0; i < 700; i++) {
            const R = (k) => h1(i + seed * 300, k, 9);
            const ox = (R(1) - 0.5) * 6, a = t2 - (T0 + 0.05 * (ox + 1)) - 0.03 * R(8); if (a < 0) continue;
            const vx = (R(2) - 0.5) * 3, vy = 2 + 5 * R(3), vz = 1.5 + 6.5 * R(4);
            const px = ox + vx * a, py = deckY(ox) + 0.15 + vy * a - 4.9 * a * a, pz = -0.36 + vz * a;
            if (py < Y || a > 1.3) continue;
            const vel = [vx * 0.03, (vy - 9.8 * a) * 0.03, vz * 0.03];
            drops.add([px, py, pz], vel, 0.008 + 0.03 * R(5) ** 2, 1.6, dropCol, 0.95 * (1 - smooth((a - 0.8) / 0.5)), 3, 0, 0.35, 0.35);
          }
        }
        // ---- surging river: foam streaks racing downstream, stronger as the wave builds
        const surge = 0.45 + 0.55 * smooth((t2 - (T0 - 1.2)) / 1.0);
        const cb = camBasis(ctx.camera);
        for (let i = 0; i < 420; i++) {
          if (h1(i, 1, 1) > surge) continue;
          const sp = 4.2 * (0.8 + 0.5 * h1(i, 1, 2)), L = 18;
          const z = -14 + (((h1(i, 1, 3) * L + sp * t2) % L) + L) % L, x = (h1(i, 1, 4) - 0.5) * 12;
          if (Math.abs(z - cb.pos.z) < 0.4 && Math.abs(x - cb.pos.x) < 0.4) continue;
          const y = Y + 0.03 + 0.05 * Math.sin(t2 * 5 + i);
          const edge = smooth((z + 14) / 2) * (1 - smooth((z - 2) / 2));
          surf.add([x, y, z], [0, 0, 0.25 + 0.5 * h1(i, 1, 5)], 0.03 + 0.04 * h1(i, 1, 6), 1.2, foamCol, 0.6 * edge, 0, 0, 0, 0.5);
        }
        wave.visible = any || true;
        foam.end(); drops.end(); surf.end();
      },
      dispose() { geo.dispose(); mat.dispose(); foam.dispose(); drops.dispose(); surf.dispose(); },
    };
  },
};
