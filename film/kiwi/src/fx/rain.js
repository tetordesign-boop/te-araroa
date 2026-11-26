// RAIN (FX). spec {density 0..1, angle deg (negative = drives toward +X)}.
//   - streaks in three depth bands around the camera (world-fixed, wrapped in boxes that follow the camera), longer and
//     faster near the lens; sized to the shot (close-ups get a scaled-down rain so streaks keep their screen size)
//   - sheets of rain in the distance (big camera-facing curtains with a procedural streak pattern, gusting)
//   - crown splashes on the ground around the kiwi, each lasting one drawing
// Lit by lightning through the core's flash. On twos.
import * as THREE from "three";
import { RIG_U } from "../core/cel.js";
import { Sprites, camBasis, wrap, h1, subjectDist, anchor } from "./_lib.js";

const sheetFrag = /* glsl */ `
uniform float uT; uniform float uAng; uniform float uAmt; uniform vec3 uCol; uniform float uSeed; uniform float uFlash; uniform vec3 uFlashColor;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 p = vUv * vec2(16.0, 9.0);
  float s = sin(uAng), c = cos(uAng); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float col = floor(p.x * 9.0);
  float r = h(vec2(col, uSeed));
  float y = fract(p.y * 0.35 + uT * (1.6 + r) + r * 7.0);
  float streak = step(0.82, r + 0.1) * smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.25, 0.4, y));
  float thin = 1.0 - smoothstep(0.15, 0.45, abs(fract(p.x * 9.0) - 0.5));
  float curtain = smoothstep(0.35, 0.75, vn(vec2(vUv.x * 3.0 - uT * 0.35, uSeed)) ) * smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
  float a = (streak * thin * 0.6 + curtain * 0.22) * uAmt * curtain;
  vec3 cc = mix(uCol, uFlashColor, uFlash * 0.7);
  gl_FragColor = vec4(cc, a);
}`;

export default {
  create(ctx, spec) {
    const group = new THREE.Group(); group.name = "fx:rain";
    const dens = spec.density ?? 0.5, ang = THREE.MathUtils.degToRad(spec.angle ?? -10);
    const rig = ctx.rig;
    const near = new Sprites(ctx, { max: 900, flash: 0.7, fog: 0.4, renderOrder: 20, name: "rain-near" });
    const far = new Sprites(ctx, { max: 2600, flash: 0.6, fog: 0.8, renderOrder: 19, name: "rain-far" });
    const spl = new Sprites(ctx, { max: 300, flash: 0.6, fog: 0.5, renderOrder: 18, name: "rain-splash" });
    group.add(near.mesh, far.mesh, spl.mesh);
    const streakCol = new THREE.Color(rig.sky[1]).lerp(new THREE.Color("#E8F0FF"), 0.55);
    const farCol = new THREE.Color(rig.fog.color).lerp(new THREE.Color("#DDE6F5"), 0.35);
    // sheets
    const sheets = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uAng: { value: ang }, uAmt: { value: 0 }, uCol: { value: farCol.clone() }, uSeed: { value: i * 7.3 + 1 }, uFlash: RIG_U.uFlash, uFlashColor: RIG_U.uFlashColor },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: sheetFrag, transparent: true, depthWrite: false,
      });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); q.frustumCulled = false; q.renderOrder = 10 - i; q.name = "rain-sheet";
      sheets.push({ q, d: [22, 55, 130][i] }); group.add(q);
    }
    const P = new THREE.Vector3(), base = new THREE.Vector3(), C = new THREE.Vector3();
    // bands: count, box (x subject scale), speed, width (m), min px, alpha
    const bands = [
      { n: Math.round(140 + 420 * dens), box: 2.2, speed: 9.5, w: 0.004, px: 1.3, a: 0.55, sh: 0.045, sp: near, near: true },
      { n: Math.round(400 + 1000 * dens), box: 7, speed: 9, w: 0.006, px: 1.0, a: 0.45, sh: 0.04, sp: far },
      { n: Math.round(300 + 800 * dens), box: 20, speed: 8.5, w: 0.01, px: 0.9, a: 0.3, sh: 0.035, sp: far },
    ];
    return {
      object: group,
      update(t, t2, ctx) {
        near.begin(ctx); far.begin(ctx); spl.begin(ctx);
        const cb = camBasis(ctx.camera);
        const D = subjectDist(ctx), s = THREE.MathUtils.clamp(D / 2.6, 0.06, 1.4);
        const dir = new THREE.Vector3(Math.sin(-ang), -Math.cos(ang), 0.12);
        for (const [bi, b] of bands.entries()) {
          const B = b.box * s, vel = dir.clone().multiplyScalar(b.speed * Math.max(s, 0.25));
          C.copy(cb.pos).addScaledVector(cb.fwd, B * 0.45);
          const streak = vel.clone().multiplyScalar(b.sh);
          for (let i = 0; i < b.n; i++) {
            base.set(h1(i, bi, 1) * B * 9.1, h1(i, bi, 2) * B * 9.3, h1(i, bi, 3) * B * 8.7).addScaledVector(vel, t2 + h1(i, bi, 4) * 3);
            wrap(P, base, C, B);
            const dc = P.distanceTo(cb.pos);
            if (dc < D * (b.near ? 0.35 : 0.2) + 0.03) continue;
            if (ctx.opts.closeup && dc < D * 1.15) continue;          // keep the lens clear in extreme close-ups
            const len = 0.7 + 0.6 * h1(i, bi, 5);
            b.sp.add(P, streak.clone().multiplyScalar(len), b.w * s, b.px, b.near ? streakCol : farCol, b.a * (0.6 + 0.4 * h1(i, bi, 6)), 0, 0, 0, 0.25);
          }
        }
        // distant sheets
        const fovH = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2);
        for (const [i, sh] of sheets.entries()) {
          const d = sh.d * Math.max(0.5, s);
          sh.q.position.copy(cb.pos).addScaledVector(cb.fwd, d);
          sh.q.quaternion.copy(ctx.camera.quaternion);
          const hh = d * fovH * 2.6; sh.q.scale.set(hh * ctx.camera.aspect, hh, 1);
          sh.q.material.uniforms.uT.value = t2; sh.q.material.uniforms.uAmt.value = (0.35 + 0.65 * dens) * (1 - i * 0.2) * (ctx.opts.closeup ? 0.6 : 1);
        }
        // splashes around the kiwi's feet (crowns of 4 droplets, one drawing each)
        const root = anchor(ctx, "root", [0, 0, 0]), y0 = root.y;
        const nS = Math.round(70 * dens), R = 1.6 * s, frame = Math.floor(t2 * 12);
        for (let i = 0; i < nS; i++) {
          const x = root.x + (h1(i, frame, 7) - 0.5) * 2 * R, z = root.z + (h1(i, frame, 8) - 0.5) * 2 * R;
          const gy = ctx.heightAt(x, z); if (!isFinite(gy) || Math.abs(gy - y0) > 0.35) continue;
          const sz = 0.018 * s;
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2 + h1(i, k, frame) * 0.8;
            const dx = Math.cos(a) * sz * 0.8, dz = Math.sin(a) * sz * 0.5;
            spl.add([x + dx, gy + sz * (0.9 + 0.5 * h1(i, k, 3)), z + dz], [dx * 0.6, sz * 0.8, dz * 0.6], 0.004 * s, 1.0, streakCol, 0.7, 0, 0, 0, 0.3);
          }
        }
        near.end(); far.end(); spl.end();
      },
      dispose() { near.dispose(); far.dispose(); spl.dispose(); for (const sh of sheets) { sh.q.geometry.dispose(); sh.q.material.dispose(); } },
    };
  },
};
