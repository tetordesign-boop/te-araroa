// SNOW (FX). spec {density 0..1}.
//   - falling flakes in three depth bands around the camera: two-tone discs (lit side / blue shadow side), big soft
//     out-of-focus flakes close to the lens, tiny specks far away; each flake sways on its own phase
//   - spindrift: gusty bands of fine snow streaming low across the ground around the kiwi
// On twos, a pure function of t.
import * as THREE from "three";
import { Sprites, camBasis, wrap, h1, subjectDist, anchor } from "./_lib.js";

export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:snow";
    const dens = spec.density ?? 0.5, rig = ctx.rig;
    const flakes = new Sprites(ctx, { max: 2400, flash: 0.3, fog: 0.6, renderOrder: 21, name: "snow-flakes" });
    const drift = new Sprites(ctx, { max: 900, flash: 0.3, fog: 0.4, renderOrder: 20, name: "snow-drift" });
    group.add(flakes.mesh, drift.mesh);
    const white = new THREE.Color("#F6F9FF"), shadeTint = new THREE.Color(rig.shade);
    const flakeCol = white.clone().lerp(new THREE.Color(rig.key.color), 0.2);
    const driftCol = white.clone().lerp(new THREE.Color(rig.fog.color), 0.25);
    const P = new THREE.Vector3(), base = new THREE.Vector3(), C = new THREE.Vector3();
    const bands = [
      { n: Math.round(14 + 30 * dens), box: 1.6, w: 0.022, px: 3, a: 0.45, shape: 2, sh: 0 },     // bokeh near the lens
      { n: Math.round(250 + 600 * dens), box: 5, w: 0.012, px: 1.6, a: 0.95, shape: 3, sh: 0.3 },
      { n: Math.round(300 + 700 * dens), box: 16, w: 0.02, px: 1.1, a: 0.8, shape: 0, sh: 0 },
    ];
    return {
      object: group,
      update(t, t2, ctx) {
        flakes.begin(ctx); drift.begin(ctx);
        const cb = camBasis(ctx.camera), D = subjectDist(ctx), s = THREE.MathUtils.clamp(D / 3, 0.15, 1.4);
        for (const [bi, b] of bands.entries()) {
          const B = b.box * s; C.copy(cb.pos).addScaledVector(cb.fwd, B * 0.45);
          for (let i = 0; i < b.n; i++) {
            const fall = (0.55 + 0.5 * h1(i, bi, 9)) * s, ph = h1(i, bi, 4) * 6.28;
            base.set(h1(i, bi, 1) * B * 9.1 + 0.35 * s * t2 + Math.sin(t2 * 1.7 + ph) * 0.05 * s, h1(i, bi, 2) * B * 9.3 - fall * t2, h1(i, bi, 3) * B * 8.7 + Math.cos(t2 * 1.3 + ph) * 0.04 * s);
            wrap(P, base, C, B);
            const dc = P.distanceTo(cb.pos); if (dc < 0.06 + D * 0.08) continue;
            if (ctx.opts.closeup && dc < D * 0.9 && bi > 0) continue;
            const sz = b.w * s * (0.6 + 0.7 * h1(i, bi, 5));
            flakes.add(P, b.shape === 2 ? null : [0.02 * s, -fall * 0.03, 0], sz, b.px, bi === 2 ? driftCol : flakeCol, b.a * (0.6 + 0.4 * h1(i, bi, 6)), b.shape, 0, b.sh, 1);
          }
        }
        // spindrift: fine streaks blown low across the snow, in gusting bands
        const root = anchor(ctx, "root", [0, 0, 0]);
        const n = Math.round(160 + 420 * dens), R = 3.2 * s, wind = new THREE.Vector3(3.2, 0.15, 0.5).multiplyScalar(s);
        for (let i = 0; i < n; i++) {
          const ph = h1(i, 2, 11);
          base.set(h1(i, 2, 1) * R * 7.1, 0, (h1(i, 2, 3) - 0.5) * 2.4 * R).addScaledVector(wind, t2 + ph * 4);
          const x = root.x - R / 2 + ((base.x % R) + R) % R, z = root.z - 0.8 * R + base.z * 0.5;
          const band = 0.5 + 0.5 * Math.sin((x - t2 * 2.5 * s) * 1.6 / s + i * 0.002);
          if (band < 0.35) continue;
          const gy = ctx.heightAt(x, z); if (!isFinite(gy)) continue;
          const y = gy + (0.01 + 0.12 * h1(i, 2, 5) ** 2) * s + Math.sin(t2 * 6 + i) * 0.01 * s;
          drift.add([x, y, z], wind.clone().multiplyScalar(0.05 + 0.08 * h1(i, 2, 6)), 0.004 * s, 0.9, driftCol, 0.55 * band, 0, 0, 0, 0.2);
        }
        flakes.end(); drift.end();
      },
      dispose() { flakes.dispose(); drift.dispose(); },
    };
  },
};
