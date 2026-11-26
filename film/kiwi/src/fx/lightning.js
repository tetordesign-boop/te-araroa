// LIGHTNING (FX). A branching bolt strikes spec.at on the beat spec.t, drawn like a sakuga FX cut:
//   2 frames of stepped leader (anticipation), then the full bolt (white core, pale-blue edge, wide glow, lit cloud base,
//   a glow + broken reflection on the sea), held for 2 drawings with flickering branches, then after-images on twos
//   (thin, offset ghost), a re-strike synced to any later entry in the shot's flash list, and a fading afterglow.
// Everything is a pure function of t (drawings change on twos). The bolt is regenerated from the seed, never stored.
import * as THREE from "three";
import { Sprites, camBasis, FPS } from "./_lib.js";

function zigzag(R, a, b, levels, rough) {
  let pts = [a, b];
  for (let l = 0; l < levels; l++) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1e-6;
      const m = 0.5 + (R() - 0.5) * 0.35, off = (R() * 2 - 1) * rough * len * (l < 2 ? 1.25 : 1);
      out.push([p[0] + dx * m - (dy / len) * off, p[1] + dy * m + (dx / len) * off], q);
    }
    pts = out;
  }
  return pts;
}

/** The bolt in a local 2D plane (x right, y up, metres), strike point at (0, 0). */
function makeBolt(seed, H) {
  const R = (() => { let s = (seed * 2654435761) >>> 0 || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
  const chans = [];
  const main = zigzag(R, [(R() - 0.5) * 0.3 * H, H], [0, 0], 6, 0.2);
  chans.push({ pts: main, w0: 1, w1: 1, level: 0, start: 0, id: 0 });
  const nb = 6 + Math.floor(R() * 3);
  for (let b = 0; b < nb; b++) {
    const u = 0.2 + R() * 0.55, i0 = Math.floor(u * (main.length - 1)), S = main[i0];
    const side = b % 2 ? -1 : 1, th = (25 + R() * 40) * Math.PI / 180, len = H * (0.12 + R() * 0.24) * (1 - u * 0.5);
    const E = [S[0] + side * Math.sin(th) * len, S[1] - Math.cos(th) * len];
    const pts = zigzag(R, S, E, 3, 0.34);
    const br = { pts, w0: 0.62, w1: 0.08, level: 1, start: u, id: chans.length };
    chans.push(br);
    const ns = R() < 0.75 ? 1 + Math.floor(R() * 2) : 0;
    for (let k = 0; k < ns; k++) {
      const v = 0.25 + R() * 0.5, j = Math.floor(v * (pts.length - 1)), Q = pts[j];
      const th2 = th + (0.2 + R() * 0.5) * (R() < 0.7 ? 1 : -1), l2 = len * (0.25 + R() * 0.3);
      const E2 = [Q[0] + side * Math.sin(th2) * l2, Q[1] - Math.cos(th2) * l2];
      chans.push({ pts: zigzag(R, Q, E2, 2, 0.38), w0: 0.62 * (1 - v) * 0.7 + 0.1, w1: 0.05, level: 2, start: u + 0.05, id: chans.length, parent: br.id });
    }
  }
  return chans;
}

const smoothU = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:lightning"; group.userData.popOK = true;
    const rig = ctx.rig;
    const glow = new Sprites(ctx, { max: 900, blend: "max", fog: 0, flash: 0, renderOrder: 5, name: "bolt-glow" });
    const ink = new Sprites(ctx, { max: 1200, fog: 0, flash: 0, renderOrder: 6, name: "bolt-ink" });
    const edge = new Sprites(ctx, { max: 1200, fog: 0, flash: 0, renderOrder: 6, name: "bolt-edge" });
    const core = new Sprites(ctx, { max: 1200, fog: 0, flash: 0, renderOrder: 7, name: "bolt-core" });
    for (const s of [glow, ink, edge, core]) { s.mesh.userData.popOK = true; group.add(s.mesh); }
    // the strike ends in the water: coast_storm's sea sits around y -1.8 with crests to -0.3
    const P = new THREE.Vector3(...spec.at); if (ctx.shot.env === "coast_storm") P.y = Math.min(P.y, -1.1);
    const splash = new Sprites(ctx, { max: 80, fog: 0, flash: 0.3, renderOrder: 8, name: "bolt-splash" });
    splash.mesh.userData.popOK = true; group.add(splash.mesh);
    const seed = spec.seed ?? 1;
    // re-strikes: later flashes in the shot's own list (within 0.8 s), in drawings (2 frames) after the strike
    const restrike = new Map();
    for (const f of ctx.shot.flash ?? []) { const d = Math.round((f.t - spec.t) * FPS / 2); if (d >= 2 && d <= 8) restrike.set(d, f.k ?? 1); }
    const glowCol = new THREE.Color(rig.rim.color).lerp(new THREE.Color("#8EA2FF"), 0.45);
    const edgeCol = new THREE.Color(rig.rim.color).lerp(new THREE.Color("#C9D8FF"), 0.5);
    const skyCol = new THREE.Color(rig.sky[1]).lerp(new THREE.Color("#DCE6FF"), 0.55);
    const white = new THREE.Color("#FFFFFF"), inkCol = new THREE.Color(rig.ink);
    const bolt = makeBolt(seed, 1), boltH = 1; let flashLevel = 0;
    const W = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

    /** State of drawing d (2-frame steps from the strike): intensity, branch keep fraction, ghost offset, leader. */
    function drawing(d) {
      if (d < -1) return null;
      if (d === -1) return { I: 0.55, keep: 0.35, leader: 0.55 };
      if (d === 0) return { I: 1, keep: 1 };
      if (d === 1) return { I: 0.92, keep: 0.75, wob: 1 };
      if (restrike.has(d)) return { I: 0.55 + 0.45 * restrike.get(d), keep: 0.6, wob: 2 };
      const last = Math.max(1, ...[...restrike.keys()].filter((k) => k < d));
      const age = d - last;
      if (age === 1) return { I: 0.5, keep: 0.0, ghost: 1, thin: 0.55 };
      if (age === 2) return { I: 0.3, keep: 0.0, ghost: -1, thin: 0.4 };
      if (age === 3) return { I: 0.14, keep: 0, thin: 0.3, glowOnly: 1 };
      return null;
    }

    return {
      object: group,
      update(t, t2, ctx) {
        for (const s of [glow, ink, edge, core, splash]) s.begin(ctx);
        flashLevel = 0;
        const f = Math.floor((t - spec.t) * FPS + 1e-4), d = Math.floor(f / 2);
        const st = drawing(d);
        if (st) {
          const cb = camBasis(ctx.camera);
          const toP = tmpA.copy(P).sub(cb.pos); const dist = toP.length();
          // the bolt plane faces the camera (vertical, perpendicular to the horizontal view direction)
          const right = tmpB.set(-toP.z, 0, toP.x).normalize(); if (right.dot(cb.right) < 0) right.negate();
          // tall enough to leave the top of the frame (camera's vertical half-angle at this distance)
          const H = (dist * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2) + cb.pos.y - P.y) * 1.25 + 2;
          const sc = H;
          const wp = (x, y, out = new THREE.Vector3()) => out.copy(P).addScaledVector(right, x * sc).setY(P.y + y * sc);
          const I = st.I, thin = st.thin ?? 1;
          const wob = st.wob ? (st.wob * 0.004) : 0;
          const inked = d >= 0 && (d <= 1 || restrike.has(d));     // flash frames: ink rim so the bolt reads on a lit sky
          flashLevel = d >= 2 ? I * 0.35 : 0;
          // lit cloud base + sky behind the upper bolt
          const ctop = wp(bolt[0].pts[0][0] * 0.6, 0.82);
          glow.add(ctop, null, dist * 0.55, 0, skyCol, 0.55 * I, 1);
          glow.add(wp(bolt[0].pts[0][0] * 0.2 - 0.18, 0.7), null, dist * 0.42, 0, skyCol, 0.35 * I, 1);
          glow.add(wp(0.2, 0.75), null, dist * 0.35, 0, skyCol, 0.3 * I, 1);
          // glow on the sea + broken reflection toward the camera
          const seaW = dist * 0.06 * (0.7 + 0.5 * I);
          if (!st.leader) glow.add(W.copy(P).addScaledVector(right, seaW), right.clone().multiplyScalar(seaW * 2), dist * 0.045, 0, edgeCol, 0.6 * I, 1);
          const towards = new THREE.Vector3(-toP.x, 0, -toP.z).normalize();
          for (let k = 1; k < 9; k++) {
            const z = k * dist * 0.045, jitter = (Math.sin((k * 7.3 + d * 3.1) * 1.7) * 0.5) * dist * 0.01;
            const c = W.copy(P).addScaledVector(towards, z).addScaledVector(right, jitter); c.y = P.y + 0.02;
            const len = dist * (0.05 - k * 0.003) * (0.6 + 0.4 * Math.sin(k * 3.7 + d * 2.3) ** 2);
            if (st.glowOnly || st.leader) continue;
            edge.add(c.clone().addScaledVector(right, len * 0.5), right.clone().multiplyScalar(len), 0, 2.2, k % 2 ? edgeCol : white, 0.7 * I * (1 - k / 10), 0);
          }
          // channels
          for (const ch of bolt) {
            const isMain = ch.level === 0;
            if (!isMain) {
              const h = (Math.sin(ch.id * 91.7 + d * 13.1 + seed) * 43758.5) % 1; const hv = Math.abs(h);
              if (hv > st.keep) continue;
              if (st.leader && ch.start > st.leader * 0.8) continue;
            }
            const pts = ch.pts, n = pts.length - 1;
            const lim = st.leader ? Math.floor(n * (isMain ? st.leader : 0.6)) : n;
            const lvlW = isMain ? 1 : ch.level === 1 ? 0.62 : 0.4;
            for (let i = 0; i < lim; i++) {
              const a = pts[i], b = pts[i + 1];
              const wa = ch.w0 + (ch.w1 - ch.w0) * (i / n), wb = ch.w0 + (ch.w1 - ch.w0) * ((i + 1) / n);
              const ja = wob ? Math.sin(i * 1.9 + d * 2.7 + ch.id) * wob : 0, jb = wob ? Math.sin((i + 1) * 1.9 + d * 2.7 + ch.id) * wob : 0;
              const A = wp(a[0] + ja, a[1]), B = wp(b[0] + jb, b[1]);
              const v = B.clone().sub(A);
              const coreW = 6.5 * thin, glowW = (isMain ? 80 : 40) * (0.6 + 0.4 * I);
              if (i % 2 === 0) glow.add(B, v, 0, glowW * wb, glowCol, (isMain ? 0.75 : 0.5) * I, 1, 0, 0, 1);
              if (st.glowOnly) continue;
              if (inked) ink.add(B, v, 0, Math.max(3.5, coreW * 2.3 * wb + 5), inkCol, 1, 0, 0, 0, (wa * coreW * 2.3 + 5) / Math.max(wb * coreW * 2.3 + 5, 1e-3));
              edge.add(B, v, 0, Math.max(1.5, coreW * 2.3 * wb), st.leader ? glowCol : edgeCol, Math.min(1, 1.1 * I + 0.1), 0, 0, 0, wa / Math.max(wb, 1e-3));
              if (!st.leader && !st.thin) core.add(B, v, 0, Math.max(1.0, coreW * wb), white, 1, 0, 0, 0, wa / Math.max(wb, 1e-3));
              else if (st.thin && isMain) core.add(B, v, 0, Math.max(1.0, coreW * wb * 0.6), edgeCol.clone().lerp(white, 0.5), I + 0.2, 0, 0, 0, wa / Math.max(wb, 1e-3));
              if (st.ghost && isMain) {   // after-image: the same drawing, offset sideways
                const off = st.ghost * H * 0.018;
                const A2 = wp(a[0] + off, a[1]), B2 = wp(b[0] + off, b[1]);
                edge.add(B2, B2.clone().sub(A2), 0, 2.2, glowCol, 0.55 * I, 0);
              }
            }
          }
          // bright point where it hits the sea
          if (!st.leader && !st.glowOnly) core.add(W.copy(P), null, dist * 0.012, 6, white, I, 1);
        }
                // the sea bursts where it hits: a white column of spray on twos (rises, falls back), drawn after the strike
        const u2 = t2 - spec.t;
        if (u2 >= 0 && u2 < 0.75) {
          const cb = camBasis(ctx.camera), dist = cb.pos.distanceTo(P), sz = dist * 0.006;
          const right = new THREE.Vector3(-(P.z - cb.pos.z), 0, P.x - cb.pos.x).normalize();
          for (let i = 0; i < 26; i++) {
            const a = (i / 25 - 0.5) * 2.2 + Math.sin(i * 7.7) * 0.15, sp = (0.55 + 0.45 * Math.abs(Math.sin(i * 3.1))) * dist * 0.09;
            const vx = Math.sin(a) * sp, vy = Math.cos(a) * sp * 1.3, g = dist * 0.22;
            const x = vx * u2, y = vy * u2 - 0.5 * g * u2 * u2; if (y < -0.2) continue;
            const pp = P.clone().addScaledVector(right, x); pp.y += y;
            const vel = right.clone().multiplyScalar(vx * 0.06); vel.y = (vy - g * u2) * 0.06;
            splash.add(pp, vel, sz * (1 - u2), 2, "#EEF4FF", 1 - smoothU(u2 / 0.75), 3, 0, 0.35, 0.4);
          }
        }
        for (const s of [glow, ink, edge, core, splash]) s.end();
      },
      flash(t) { return flashLevel; },
      dispose() { for (const s of [glow, ink, edge, core, splash]) s.dispose(); },
    };
  },
};
