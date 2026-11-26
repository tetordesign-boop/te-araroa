// S17 — the night behind the end title (the core draws "TA." + the line at ~45 % height). Deep night #0C1526, a faint
// Milky Way across the upper corner, painted dim stars, twinkling stars (on twos) as 3D points, a low mountain
// silhouette with a moonlit crest and a darker near ridge. The centre stays calm.
import * as THREE from "three";
import { rng } from "../core/time.js";
import { stroke, blob } from "../core/paint.js";
import { makeNoise, frame, paintSky, paintRange, rangeProfile, rgba, smoothstep } from "./sky/kit.js";

const N = makeNoise(17);
const SKY = [[-20, "#13203A"], [-4, "#172743"], [0, "#15233F"], [6, "#101C33"], [16, "#0C1528"], [30, "#09111F"], [50, "#070E1B"]];
const FAR = rangeProfile({ base: -8.6, amp: 1.0, wave: 5, seed: 3, sharp: 0.7, jag: 0.25, peaks: [{ az: -30, el: 9.2, w: 12 }, { az: 22, el: 8.0, w: 10 }, { az: 44, el: 10.0, w: 14 }, { az: -58, el: 8.5, w: 12 }] });
const NEAR = rangeProfile({ base: -12, amp: 0.9, wave: 6, seed: 8, sharp: 0.4, jag: 0.1, peaks: [{ az: -46, el: 10.5, w: 16 }, { az: 34, el: 9.6, w: 18 }] });
const calm = (az, el) => smoothstep(10, 20, Math.abs(az)) + smoothstep(6, 10, Math.abs(el - 1.5)) > 0.5;   // keep the title area clear

export default {
  layers: [
    {
      name: "sky", depth: 2600, quality: 0.6, brush: { r: 3, paper: 0.05 }, flash: 0,
      paint(g, L) {
        const F = frame(L), r = rng(9);
        paintSky(g, L, F, { stops: SKY, seed: 4, wash: 0.04, glows: [{ az: 0, el: -6, r: 40, color: "#1F3254", a: 0.35 }] });
        // the Milky Way: a soft diagonal band high on the right, dark dust lanes, star dust
        const band = (u) => { const az = -10 + u * 80, el = 34 - u * 22; return F.at(az, el); };
        for (let i = 0; i < 900; i++) {
          const u = r(), [x, y] = band(u), off = r.gauss() * 5 * F.ppd;
          g.globalAlpha = r.range(0.07, 0.16); stroke(g, x - off * 0.45, y - off * 0.9, -0.3 + r.gauss() * 0.1, r.range(4, 12) * F.ppd, r.range(1, 3) * F.ppd, r() < 0.7 ? "#4A5E8C" : "#7484AA", 0.9, r);
        }
        for (let i = 0; i < 160; i++) { const u = r(), [x, y] = band(u), off = r.gauss() * 1.5 * F.ppd; g.globalAlpha = r.range(0.15, 0.35); stroke(g, x - off * 0.45, y - off * 0.9, -0.3, r.range(2, 6) * F.ppd, r.range(0.3, 0.8) * F.ppd, "#0A1222", 0.9, r); }
        g.globalAlpha = 1;
        for (let i = 0; i < 5200; i++) {   // painted dim stars, denser in the band
          const x = r() * L.w, y = r() * L.h, az = F.azAt(x), el = F.elevAt(x, y); if (el < -1 || !calm(az, el)) continue;
          const u = (az + 10) / 80, inBand = Math.exp(-(((el - (34 - u * 22)) / 6) ** 2));
          if (r() > 0.25 + 0.75 * inBand) continue;
          g.globalAlpha = r.range(0.35, 0.85); g.fillStyle = r() < 0.8 ? "#C8D4F0" : "#F0E6D0"; g.beginPath(); g.arc(x, y, r.range(0.8, 1.9), 0, 6.283); g.fill();
        }
        g.globalAlpha = 1;
      },
    },
    {
      name: "range", depth: 1500, quality: 0.6, brush: { r: 3, paper: 0.05 }, flash: 0,
      paint(g, L) {
        const F = frame(L);
        const top = (px) => F.rowAt(px, FAR(F.azAt(px)));
        paintRange(g, L, { top, bottom: L.h, light: [0.5, 0.6, 0.3], seed: 6, scale: 2.5 * F.ppd, f: 3, strokes: 0.8, rimW: 1.6, thresh: [0.55, 0.85],
          pal: { lit: "#1A2944", mid: "#121E36", shade: "#0D172B", deep: "#0A1324", haze: "#14213D", rim: "#3A5078", snowLit: "#3A4E74", snowShade: "#1A2846" },
          snow: (px, py, d) => (d < 0.5 * F.ppd && FAR(F.azAt(px)) > -5.5 ? 1 : 0), haze: (px, py) => 0.25 + 0.4 * smoothstep(top(px), top(px) + 5 * F.ppd, py) });
      },
    },
    {
      name: "ridge", depth: 220, quality: 0.6, brush: { r: 3, paper: 0.05 }, flash: 0,
      paint(g, L) {
        const F = frame(L);
        const top = (px) => F.rowAt(px, NEAR(F.azAt(px)));
        paintRange(g, L, { top, bottom: L.h, light: [0.5, 0.6, 0.3], seed: 7, scale: 3 * F.ppd, f: 3, strokes: 0.6, rimW: 1.2, thresh: [0.7, 0.95], ribs: 0.5,
          pal: { lit: "#0B1426", mid: "#081020", shade: "#060C19", deep: "#050A15", haze: "#0C1526", rim: "#24365A" } });
      },
    },
  ],
  build(ctx) {
    const r = rng(23), n = 1100, pos = new Float32Array(n * 3), aux = new Float32Array(n * 3);
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const az = r.range(-62, 62), el = r.range(-3, 46); if (!calm(az, el)) continue;
      const a = az * Math.PI / 180, e = el * Math.PI / 180, D = 2200;
      pos.set([Math.sin(a) * Math.cos(e) * D, Math.sin(e) * D, 10 - Math.cos(a) * Math.cos(e) * D], k * 3);
      aux.set([r() ** 4, r() * 6.283, r.range(2, 7)], k * 3); k++;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, k * 3), 3)); geo.setAttribute("aux", new THREE.BufferAttribute(aux.subarray(0, k * 3), 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 aux; uniform float uT; varying float vB; varying float vWarm;
        void main(){ float tw = 0.65 + 0.35 * sin(uT * aux.z + aux.y) * sin(uT * aux.z * 0.37 + aux.y * 2.1);
          vB = (0.5 + 0.5 * aux.x) * tw; vWarm = step(0.85, fract(aux.y * 7.3));
          gl_PointSize = 2.6 + 7.0 * aux.x * tw; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vB; varying float vWarm;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); float core = smoothstep(0.5, 0.1, d); float cross = max(smoothstep(0.06, 0.0, abs(p.x)), smoothstep(0.06, 0.0, abs(p.y))) * smoothstep(0.5, 0.0, d) * 0.6;
          vec3 c = mix(vec3(0.82, 0.88, 1.0), vec3(1.0, 0.93, 0.8), vWarm); gl_FragColor = vec4(c * (core + cross) * vB * 1.15, (core + cross) * vB); }`,
    });
    const stars = new THREE.Points(geo, mat); stars.name = "stars"; stars.frustumCulled = false; stars.renderOrder = -2000;
    const group = new THREE.Group(); group.add(stars);
    return { group, heightAt: () => -100, colliders: [], update(t, t2) { mat.uniforms.uT.value = t2; } };
  },
};
