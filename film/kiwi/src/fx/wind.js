// WIND (FX).
// Gust mode {gust, strength, dir}: anime wind lines (curved strokes that draw on and off as they whoosh across), grit,
//   tumbling tussock blades and, on the gust, a surge: twice the lines and grit plus a low sheet of red volcanic dust.
// Spiral mode {spiral, strength}: debris, grit and wind strokes drawn up in a widening-to-narrowing helix from the ridge
//   toward the sky vortex (the point the shot's last camera key looks at).
// Pure function of t (on twos).
import * as THREE from "three";
import { Sprites, camBasis, h1, smooth, subjectDist, anchor } from "./_lib.js";

export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:wind";
    const rig = ctx.rig, k = spec.strength ?? 1;
    const strokes = new Sprites(ctx, { max: 1400, flash: 0.2, fog: 0.3, renderOrder: 24, name: "wind-lines" });
    const grit = new Sprites(ctx, { max: 1400, flash: 0.2, fog: 0.5, renderOrder: 23, name: "wind-grit" });
    const dust = new Sprites(ctx, { max: 120, flash: 0.1, fog: 0.4, renderOrder: 22, name: "wind-dust" });
    group.add(dust.mesh, grit.mesh, strokes.mesh);
    const lineCol = new THREE.Color(rig.sky[1]).lerp(new THREE.Color("#FFFFFF"), 0.65);
    const gritCol = new THREE.Color(rig.shade).lerp(new THREE.Color("#2A1414"), 0.5);
    const bladeCol = new THREE.Color("#C9A35A").lerp(new THREE.Color(rig.key.color), 0.25);
    const dustCol = new THREE.Color(ctx.PALETTE.crater).lerp(new THREE.Color(rig.fog.color), 0.45);
    const spiral = !!spec.spiral;
    // spiral axis: from the ridge behind the kiwi toward where the last camera key looks
    const keys = ctx.shot.cam["16x9"], last = keys[keys.length - 1];
    const lp = Array.isArray(last.pos) ? new THREE.Vector3(...last.pos) : new THREE.Vector3(3, 1, 10), ll = Array.isArray(last.look) ? new THREE.Vector3(...last.look) : new THREE.Vector3(0, 9, -40);
    const apex = lp.clone().addScaledVector(ll.clone().sub(lp).normalize(), 70);
    const B0 = new THREE.Vector3(0, 0, -2.5), axis = apex.clone().sub(B0);
    const U = new THREE.Vector3(1, 0, 0), V = new THREE.Vector3().crossVectors(axis.clone().normalize(), U).normalize();
    const helix = (s, th) => { const R = 5.5 + (1.2 - 5.5) * Math.pow(s, 0.6); return B0.clone().addScaledVector(axis, Math.pow(s, 1.25)).addScaledVector(U, Math.cos(th) * R).addScaledVector(V, Math.sin(th) * R); };
    const dir = new THREE.Vector3(...(spec.dir ?? [-1, 0, 0])).normalize();
    const intensity = (t) => {
      if (spiral) return 0.8 + 0.2 * Math.sin(t * 1.3);
      const g = spec.gust ?? -99;
      const env = smooth((t - (g - 0.12)) / 0.12) * (1 - smooth((t - (g + 0.35)) / 0.8));
      return 0.55 + 1.25 * env;
    };
    /** Draw a stroke along a path fn(σ) (σ 0..1) between tail and head, tapered at both ends. */
    function stroke(fn, tail, head, px, a, col) {
      const n = 12; let prev = null;
      for (let j = 0; j <= n; j++) {
        const sg = tail + (head - tail) * (j / n); if (sg < 0 || sg > 1) { prev = null; continue; }
        const p = fn(sg);
        if (prev) { const w = Math.sin(Math.PI * (j - 0.5) / n); strokes.add(p, p.clone().sub(prev), 0, Math.max(0.8, px * w), col, a, 0, 0, 0, 1); }
        prev = p;
      }
    }
    return {
      object: group,
      update(t, t2, ctx) {
        strokes.begin(ctx); grit.begin(ctx); dust.begin(ctx);
        const cb = camBasis(ctx.camera), I = intensity(t2);
        if (!spiral) {
          const D = subjectDist(ctx), s = THREE.MathUtils.clamp(D / 1.2, 0.3, 1.8);
          const ctr = anchor(ctx, "body", [0, 0.3, 0]);
          const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(dir, up).normalize();
          // wind lines: each repeats on its own cycle with a fresh placement
          const nS = Math.round(26 * k);
          for (let i = 0; i < nS; i++) {
            const T = 0.45 + 0.35 * h1(i, 1, 1), c = Math.floor((t2 + h1(i, 1, 2) * T) / T), q = (t2 + h1(i, 1, 2) * T) / T - c;
            if (h1(i, c, 3) * 2.2 > I) continue;
            const L = (0.9 + 0.8 * h1(i, c, 4)) * s, A = (0.03 + 0.06 * h1(i, c, 5)) * s, ph = h1(i, c, 6) * 6;
            const O = ctr.clone().addScaledVector(dir, -L * 0.6).add(new THREE.Vector3((h1(i, c, 7) - 0.5) * 1.6 * s, (h1(i, c, 8) - 0.35) * 0.7 * s, (h1(i, c, 9) - 0.5) * 1.4 * s));
            if (O.distanceTo(cb.pos) < 0.25 * s) continue;
            const fn = (sg) => O.clone().addScaledVector(dir, sg * L).addScaledVector(up, A * Math.sin(sg * 3.2 + ph)).addScaledVector(side, A * 0.6 * Math.sin(sg * 2 + ph));
            const head = q * 1.7, tail = head - 0.55;
            stroke(fn, tail, head, 3.4, 0.9, lineCol);
          }
          // grit + tussock bits, wrapped in a box around the kiwi
          const nG = Math.round(420 * k), Bx = 3.2 * s, By = 1.1 * s, Bz = 2.4 * s;
          const C = ctr.clone().add(new THREE.Vector3(0, 0.2 * s, 0.2 * s));
          for (let i = 0; i < nG; i++) {
            if (h1(i, 2, 1) * 2.2 > I) continue;
            const blade = i % 9 === 0, sp = (5 + 5 * h1(i, 2, 2)) * s * (blade ? 0.6 : 1);
            const vel = dir.clone().multiplyScalar(sp); vel.y += Math.sin(t2 * 3 + i) * 0.6 * s;
            const b = new THREE.Vector3(h1(i, 2, 3) * Bx * 9, h1(i, 2, 4) * By * 9, h1(i, 2, 5) * Bz * 9).addScaledVector(vel, t2);
            const p = new THREE.Vector3(), Bv = { x: Bx, y: By, z: Bz };
            let edge = 0;
            for (const ax of ["x", "y", "z"]) { const B = Bv[ax], v = b[ax] - C[ax] + B / 2, m = v - B * Math.floor(v / B); p[ax] = C[ax] - B / 2 + m; edge = Math.max(edge, Math.abs(m / B - 0.5) * 2); }
            const gy = ctx.heightAt(p.x, p.z); if (p.y < gy + 0.005) p.y = gy + 0.005 + (gy - p.y) * 0.1;
            if (p.distanceTo(cb.pos) < 0.08) continue;
            const fade = 1 - smooth((edge - 0.8) / 0.2);
            if (blade) {
              const a = h1(i, 2, 6) * 6.28 + t2 * (6 + 6 * h1(i, 2, 7)), Lb = 0.05 * s;
              grit.add(p, [Math.cos(a) * Lb, Math.sin(a) * Lb, Math.sin(a * 0.7) * Lb * 0.5], 0.008 * s, 2, bladeCol, fade, 4, 0, 0.3);
            } else grit.add(p, vel.clone().multiplyScalar(0.006), 0.0035 * s, 1.6, gritCol, 0.9 * fade, 0, 0, 0, 0.5);
          }
          // the surge: a low sheet of dust racing across
          const surge = Math.max(0, I - 0.6) / 1.2;
          for (let i = 0; i < 60 && surge > 0.02; i++) {
            const sp = 6 * s, x0 = (h1(i, 3, 1) - 0.5) * 6 * s;
            const along = ((x0 + sp * t2) % (6 * s) + 6 * s) % (6 * s) - 3 * s;
            const p = ctr.clone().addScaledVector(dir, along).add(new THREE.Vector3(0, -0.15 * s + 0.35 * s * h1(i, 3, 2) ** 2, (h1(i, 3, 3) - 0.5) * 1.6 * s));
            const fade = 1 - smooth((Math.abs(along) / (3 * s) - 0.7) / 0.3);
            dust.add(p, dir.clone().multiplyScalar(0.25 * s), (0.12 + 0.12 * h1(i, 3, 4)) * s, 0, dustCol, 0.28 * surge * fade, 1);
          }
        } else {
          // spiral: everything rides a helix up toward the sky vortex
          const n = Math.round(700 * k);
          for (let i = 0; i < n; i++) {
            const rate = 0.05 + 0.07 * h1(i, 4, 1), s = (h1(i, 4, 2) + t2 * rate) % 1;
            const th = h1(i, 4, 3) * 6.28 + s * 11 + t2 * 0.9;
            const p = helix(s, th), dc = p.distanceTo(cb.pos); if (dc < 0.15) continue;
            const fade = smooth(s / 0.08) * (1 - smooth((s - 0.85) / 0.15));
            const tang = helix(Math.min(1, s + 0.004), th + 0.05).sub(p).multiplyScalar(0.8);
            const w = Math.max(0.006, dc * 0.0025);
            if (i % 5 === 0) { const a = t2 * 7 + i; grit.add(p, [Math.cos(a) * w * 8, Math.sin(a) * w * 8, 0], w * 1.5, 2, bladeCol.clone().lerp(new THREE.Color(rig.rim.color), 0.3), fade, 4, 0, 0.35); }
            else grit.add(p, tang, w, 1.4, gritCol, 0.85 * fade, 6, 0, 0, 0.4);
          }
          const nS = Math.round(22 * k);
          for (let i = 0; i < nS; i++) {
            const T = 0.7 + 0.4 * h1(i, 5, 1), c = Math.floor((t2 + h1(i, 5, 2) * T) / T), q = (t2 + h1(i, 5, 2) * T) / T - c;
            const s0 = 0.02 + 0.6 * h1(i, c, 3), th0 = h1(i, c, 4) * 6.28;
            const fn = (sg) => helix(s0 + sg * 0.06, th0 + sg * 1.6 + s0 * 11);
            const head = q * 1.7;
            stroke(fn, head - 0.55, head, 3, 0.75, lineCol);
          }
        }
        strokes.end(); grit.end(); dust.end();
      },
      dispose() { strokes.dispose(); grit.dispose(); dust.dispose(); },
    };
  },
};
