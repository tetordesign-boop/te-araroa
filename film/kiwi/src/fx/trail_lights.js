// TRAIL LIGHTS (FX). spec {t0, t1, count}. Units: kilometres (S15 night aerial of the South Island).
// `count` orange trail triangles sit at equal km spacing along the real Te Araroa (loadGeo().trail) from Ship Cove to
// Bluff. Triangle i lights at t0 + (t1 - t0) * i / (count - 1) (the score plays one note per light on this formula):
// it pops with an overshoot and a white-hot first frame, keeps a bloom-bright core and a glow, and throws a thin ring.
// A thin line of light draws itself along the trail behind the front (skipping the sea crossings), with a hot comet
// head that reaches each triangle exactly as it lights. Sizes are in screen pixels so they read from 150 km and
// from 1000 km up. Pure function of t (on twos).
import * as THREE from "three";
import { loadGeo } from "../core/geo.js";
import { Sprites, camBasis, backOut, smooth, screen, ORANGE } from "./_lib.js";

export default {
  async create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:trail_lights";
    const geo = await loadGeo();
    const parts = geo.trail, total = geo.totalKm ?? parts[parts.length - 1].at(-1)[2];
    const n = spec.count ?? 48, t0 = spec.t0, t1 = spec.t1;
    const lightT = (i) => t0 + (t1 - t0) * i / (n - 1);
    const yAt = (x, z) => { const h = ctx.heightAt(x, z); return (Number.isFinite(h) ? Math.max(0, h) : 0) + 0.4; };
    /** Point on the trail at a given km (in a sea gap: the nearest end). */
    function at(km) {
      let best = null, bd = Infinity;
      for (const p of parts) {
        if (km >= p[0][2] && km <= p[p.length - 1][2]) {
          for (let j = 1; j < p.length; j++) if (km <= p[j][2]) { const a = p[j - 1], b = p[j], f = (km - a[2]) / Math.max(1e-6, b[2] - a[2]); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
        }
        for (const q of [p[0], p[p.length - 1]]) { const d = Math.abs(q[2] - km); if (d < bd) { bd = d; best = [q[0], q[1]]; } }
      }
      return best;
    }
    const markers = Array.from({ length: n }, (_, i) => { const km = total * i / (n - 1), [x, z] = at(km); return { km, p: new THREE.Vector3(x, yAt(x, z), z), t: lightT(i) }; });
    const pts = parts.map((p) => p.map(([x, z, km]) => ({ p: new THREE.Vector3(x, yAt(x, z), z), km })));
    const frontKm = (t) => {
      if (t < markers[0].t) return -1;
      for (let i = 1; i < n; i++) if (t < markers[i].t) { const a = markers[i - 1], b = markers[i]; return a.km + (b.km - a.km) * Math.min(1, (t - a.t) / (b.t - a.t)); }
      return total;
    };
    const lineGlow = new Sprites(ctx, { max: 1200, blend: "add", depthTest: false, flash: 0, fog: 0, renderOrder: 40, name: "trail-line-glow" });
    const line = new Sprites(ctx, { max: 1200, depthTest: false, flash: 0, fog: 0, renderOrder: 41, name: "trail-line" });
    const glow = new Sprites(ctx, { max: 200, blend: "add", depthTest: false, flash: 0, fog: 0, renderOrder: 42, name: "trail-glow" });
    const tri = new Sprites(ctx, { max: 200, depthTest: false, flash: 0, fog: 0, renderOrder: 43, name: "trail-triangles" });
    for (const s of [lineGlow, line, glow, tri]) group.add(s.mesh);
    const orange = new THREE.Color(ORANGE), hotLine = new THREE.Color("#FFC28F"), white = new THREE.Color("#FFF4E8");
    return {
      object: group,
      update(t, t2, ctx) {
        for (const s of [lineGlow, line, glow, tri]) s.begin(ctx);
        const cb = camBasis(ctx.camera);
        const H = screen(ctx).y / 1080;
        const fk = frontKm(t2);
        // ---- the line of light behind the front
        if (fk > 0) {
          let gi = 0;
          for (const part of pts) for (let j = 1; j < part.length; j++) {
            const a = part[j - 1], b = part[j]; if (a.km >= fk) break;
            const f = Math.min(1, (fk - a.km) / Math.max(1e-6, b.km - a.km));
            const head = a.p.clone().lerp(b.p, f), v = head.clone().sub(a.p);
            const behind = fk - b.km, hotK = 1 - smooth(behind / 40);
            const c = orange.clone().lerp(hotLine, 0.6 * hotK);
            line.add(head, v, 0, (2.2 + 1.4 * hotK) * H, c, 1, 0);
            if (gi++ % 2 === 0) lineGlow.add(head, v, 0, (12 + 10 * hotK) * H, orange, 0.22 + 0.25 * hotK, 1);
          }
          if (fk < total) { const hp = new THREE.Vector3(...(() => { const [x, z] = at(fk); return [x, yAt(x, z), z]; })());
            glow.add(hp, null, 0, 34 * H, orange, 0.75, 1); tri.add(hp, null, 0, 6 * H, white, 1, 0); }
        }
        // ---- the triangles
        for (const m of markers) {
          const a = t2 - m.t; if (a < 0) continue;
          const dist = m.p.distanceTo(cb.pos);
          const px = THREE.MathUtils.clamp(30 - (dist - 150) / 900 * 14, 14, 32) * H;
          const pop = backOut(a / 0.22, 2.8);
          const flashK = 1 - smooth(a / 0.18);
          const c = orange.clone().lerp(white, flashK * 0.85);
          glow.add(m.p, null, 0, px * (3.4 + 1.6 * flashK), orange, 0.5 + 0.4 * flashK, 1);
          tri.add(m.p, null, 0, px * pop, c, 1, 7, 0, 0.85, 1.3);
          if (a < 0.45) glow.add(m.p, null, 0, px * (1.4 + 5 * a / 0.45), hotLine, 0.9 * (1 - a / 0.45), 5);
        }
        for (const s of [lineGlow, line, glow, tri]) s.end();
      },
      dispose() { for (const s of [lineGlow, line, glow, tri]) s.dispose(); },
    };
  },
};
