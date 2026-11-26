// SANDFLIES (FX). spec {t0, vortex, t1, seed}. Thousands of tiny black specks (NZ sandflies) pour in from the bush
// in a stream, wind round the kiwi's head into a dense tornado on `vortex` (beat 3), then the funnel stays behind as he
// walks on, breaks apart and drifts off, thinning to nothing by t1. Specks get a little motion smear from their own
// velocity; a dark haze marks the dense core. Every speck is a closed-form function of t (on twos).
import * as THREE from "three";
import { Sprites, h1, anchor, kiwiVel, smooth } from "./_lib.js";

export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:sandflies";
    const flies = new Sprites(ctx, { max: 3200, flash: 0.2, fog: 0.3, renderOrder: 22, name: "sandflies" });
    const haze = new Sprites(ctx, { max: 40, flash: 0, fog: 0.3, renderOrder: 21, name: "sandfly-haze" });
    group.add(haze.mesh, flies.mesh);
    const N = 2600, seed = spec.seed ?? 6;
    const { t0, vortex: tv, t1 } = spec;
    const ink = new THREE.Color(ctx.rig.ink).lerp(new THREE.Color("#1a1a1a"), 0.3);
    const hazeCol = new THREE.Color(ctx.rig.ink).lerp(new THREE.Color(ctx.rig.shade), 0.3);
    const R = (i, k) => h1(i + seed * 1000, k, 3);
    const tmp = new THREE.Vector3(), prev = new THREE.Vector3();

    /** Position of fly i at time t, around a head path head(t). */
    function pos(i, t, out, head, vel) {
      const arrive = t0 + (tv - t0) * (0.08 + 0.82 * Math.pow(R(i, 1), 0.8));
      const travel = 0.55 + 0.3 * R(i, 2);
      // the vortex centre follows the head until the beat, then stays behind as he walks through
      const lagT = Math.max(0, t - tv);
      const cx = head.x - vel[0] * lagT, cz = head.z - vel[1] * lagT, cy = head.y + 0.03;
      // orbit
      const hgt = (R(i, 3) - 0.35) * 0.34;                         // tornado: wider at the top
      const r0 = (0.05 + 0.1 * Math.pow(R(i, 4), 1.5)) * (1 + Math.max(0, hgt) * 2.4);
      const tight = smooth((t - (tv - 0.7)) / 0.7) * (1 - smooth((t - tv - 0.15) / 0.4));
      const r = r0 * (1.6 - 0.75 * tight);
      const w = (4 + 5 * R(i, 5)) * (1 + 0.7 * tight);
      const th = R(i, 6) * 6.283 + w * (t - arrive) + 0.6 * Math.sin(t * 3 + i);
      const tilt = 0.25 * Math.sin(i * 0.37);
      const ox = Math.cos(th) * r, oz = Math.sin(th) * r * 0.85, oy = hgt + Math.sin(th * 2 + i) * 0.015 + ox * tilt;
      let x = cx + ox, y = cy + oy, z = cz + oz;
      // inbound stream: from the bush (behind-left, high) along a curling path
      const k = (t - (arrive - travel)) / travel;
      if (k < 1) {
        const u = Math.max(0, k), sx = cx - 1.8 - 0.6 * R(i, 7), sy = cy + 0.5 + 0.4 * R(i, 8), sz = cz - 1.2 - 0.8 * R(i, 10);
        const e = u * u * (3 - 2 * u), swirl = Math.sin(u * 6 + i) * 0.12 * (1 - u);
        const bx = sx + (x - sx) * e + swirl, by = sy + (y - sy) * e + Math.sin(u * 3.1) * 0.2, bz = sz + (z - sz) * e + Math.cos(u * 5 + i) * 0.1 * (1 - u);
        const m = smooth(k * 1.4 - 0.4);
        x = bx + (x - bx) * m; y = by + (y - by) * m; z = bz + (z - bz) * m;
        if (k < 0) { out.set(sx, sy, sz); return -1; }
      }
      // break-up: leave along the tangent, slow down, rise and wander off
      const tb = tv + 0.12 + 0.55 * R(i, 11);
      const db = t - tb;
      if (db > 0) {
        const thb = R(i, 6) * 6.283 + w * (tb - arrive);
        const tx = -Math.sin(thb), tz = Math.cos(thb), sp = w * r * 0.6;
        const d = (1 - Math.exp(-db * 2.2)) / 2.2;
        x += tx * sp * d + Math.sin(db * 2 + i) * 0.05 * db + (R(i, 12) - 0.5) * 0.6 * db;
        z += tz * sp * d * 0.85 + (R(i, 13) - 0.5) * 0.5 * db;
        y += 0.18 * db * (0.3 + R(i, 14)) + Math.sin(db * 3 + i) * 0.03;
      }
      out.set(x, y, z);
      return db;
    }

    return {
      object: group,
      update(t, t2, ctx) {
        flies.begin(ctx); haze.begin(ctx);
        const head = anchor(ctx, "head", [0, 0.38, 0]);
        const vel = kiwiVel(ctx.shot, t);
        const dt = 1 / 24;
        // head position one frame earlier (for the smear), assuming the same walk
        const headPrev = head.clone(); headPrev.x -= vel[0] * dt; headPrev.z -= vel[1] * dt;
        let dense = 0;
        if (t2 > t0 - 0.1 && t2 < t1 + 0.1) {
          for (let i = 0; i < N; i++) {
            const db = pos(i, t2, tmp, head, vel); if (db === -1) continue;
            pos(i, t2 - dt, prev, headPrev, vel);
            const span = Math.max(0.3, t1 - tv), fs = tv + span * (0.25 + 0.4 * R(i, 15));
            const fade = 1 - smooth((t2 - fs) / (span * 0.33));
            if (fade <= 0.01) continue;
            const sm = tmp.clone().sub(prev).multiplyScalar(0.3); if (sm.length() > 0.01) sm.setLength(0.01);
            flies.add(tmp, sm, 0.0034 * (0.7 + 0.6 * R(i, 16)), 2.0, ink, 0.95 * fade, 0, 0, 0, 0.6);
          }
          dense = smooth((t2 - (tv - 0.9)) / 0.9) * (1 - smooth((t2 - tv - 0.2) / 0.8));
        }
        if (dense > 0.01) {
          const lag = Math.max(0, t2 - tv);
          for (let k = 0; k < 5; k++) {
            const c = new THREE.Vector3(head.x - vel[0] * lag + Math.sin(k * 2.1 + t2 * 4) * 0.04, head.y + 0.03 + (k - 2) * 0.05, head.z - vel[1] * lag);
            haze.add(c, null, 0.28 + 0.06 * k, 0, hazeCol, 0.16 * dense, 1);
          }
        }
        flies.end(); haze.end();
      },
      dispose() { flies.dispose(); haze.dispose(); },
    };
  },
};
