// MOTES (FX). spec {density 0..1}. Gentle glowing dust and pollen floating in low sunlight: small warm glow dots with
// a bright core that twinkle on twos, a few big soft bokeh discs near the lens, all drifting slowly on curling paths.
// Colours from the rig's key and rim light (never trail orange). Sized to the shot (close-ups get tiny motes).
import * as THREE from "three";
import { Sprites, camBasis, wrap, h1, subjectDist } from "./_lib.js";

export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:motes";
    const dens = spec.density ?? 0.5, rig = ctx.rig;
    const glow = new Sprites(ctx, { max: 600, blend: "add", flash: 0, fog: 0.2, renderOrder: 22, name: "motes-glow" });
    const core = new Sprites(ctx, { max: 600, flash: 0, fog: 0.1, renderOrder: 23, name: "motes-core" });
    group.add(glow.mesh, core.mesh);
    const warm = new THREE.Color(rig.key.color).lerp(new THREE.Color(rig.rim.color), 0.35);
    const hot = new THREE.Color("#FFF6E6");
    const P = new THREE.Vector3(), base = new THREE.Vector3(), C = new THREE.Vector3();
    const N = Math.round(60 + 220 * dens);
    return {
      object: group,
      update(t, t2, ctx) {
        glow.begin(ctx); core.begin(ctx);
        const cb = camBasis(ctx.camera), D = subjectDist(ctx), s = THREE.MathUtils.clamp(D / 2, 0.08, 1.5);
        const B = 2.6 * s; C.copy(cb.pos).addScaledVector(cb.fwd, B * 0.5);
        for (let i = 0; i < N; i++) {
          const ph = h1(i, 1, 4) * 6.28, sp = 0.6 + 0.8 * h1(i, 1, 5);
          base.set(h1(i, 1, 1) * B * 7 + (0.05 * t2 + 0.03 * Math.sin(t2 * 0.7 * sp + ph)) * s,
                   h1(i, 1, 2) * B * 7 + (0.02 * t2 + 0.04 * Math.sin(t2 * 0.9 * sp + ph * 1.3)) * s,
                   h1(i, 1, 3) * B * 7 + 0.03 * Math.cos(t2 * 0.6 * sp + ph) * s);
          wrap(P, base, C, B);
          const dc = P.distanceTo(cb.pos); if (dc < 0.05 * s + 0.02) continue;
          // fade at the box edges so wrapping never pops
          const e = P.clone().sub(C); const edge = Math.max(Math.abs(e.x), Math.abs(e.y), Math.abs(e.z)) / (B / 2);
          const fadeEdge = 1 - THREE.MathUtils.smoothstep(edge, 0.75, 1.0);
          const tw = 0.55 + 0.45 * Math.sin(Math.floor(t2 * 12) * 1.7 + i * 2.3) ** 2;
          const bokeh = dc < D * 0.45;
          const sz = (bokeh ? 0.02 : 0.004 + 0.004 * h1(i, 1, 6)) * s;
          if (bokeh) { glow.add(P, null, sz, 6, warm, 0.25 * fadeEdge, 2); continue; }
          glow.add(P, null, sz * 5, 5, warm, 0.5 * tw * fadeEdge, 1);
          core.add(P, null, sz, 1.6, hot, 0.95 * tw * fadeEdge, 0);
        }
        glow.end(); core.end();
      },
      dispose() { glow.dispose(); core.dispose(); },
    };
  },
};
