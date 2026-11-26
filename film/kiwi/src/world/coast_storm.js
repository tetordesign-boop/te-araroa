// COAST_STORM — exposed coastal track on a low headland, a black heaving sea behind (S04 tracking, S10a dutch,
// S11 eye ECU with blurred BG). Layers: storm sky (cumulonimbus ceiling, cold gap low on the left, rain veils),
// drifting scud (uScroll), fogged distant headlands. 3D: Gerstner swell sea (cel bands, sky sheen, whitecaps, fog,
// lightning flash), headland terrain with the track, wind-swept tussock + flax, boulders along the edge.
// Lightning (FX) strikes the sea at ~[1.5, 0, -60]: that column of sky is kept dark and clean for the bolt.
import * as K from "./land/kit.js";
import * as P from "./land/props.js";
import { RIG_U } from "../core/cel.js";

let OPTS = {};
const SEA_Y = -1.8;
const edgeZ = (x) => -3.4 + 0.45 * Math.sin(x * 0.37 + 1.1) + 0.25 * Math.sin(x * 0.91);

// ------------------------------------------------------------------------------------------------ layers
const skyLayer = {
  name: "sky", depth: 900, brush: { r: 4, paper: 0.07 }, flash: 0.55,
  get blur() { return OPTS.closeup ? 14 : 0; },
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(201), yH = L.yy(0);
    K.skyGrad(g, L, M, [[60, "#080D18"], [30, "#0D1424"], [14, "#162036"], [6, "#24304A"], [2, "#33405C"], [0, "#3A4763"], [-1, "#2E3A54"], [-10, "#1A2336"]]);
    // cold gap low on the left: pale light under the ceiling, silhouetting the far headlands
    const [gx, gy] = M.p(-32, 2.5);
    K.glow(g, gx, gy, 28 * M.dpx, "#7A8BA8", 0.55, 0.3);
    K.hstreaks(g, { x: 0, y: M.el(L.w / 2, 7), w: L.w, h: yH - M.el(L.w / 2, 7) }, 700, ["#5C6C8A", "#46546E", "#8090AA"], 202, { len: [60, 240], width: [3, 9], alpha: [0.08, 0.25], density: (x) => Math.exp(-(((M.az(x) + 30) / 25) ** 2)) });
    // the ceiling: cumulonimbus masses lit coldly from the upper left
    const pal = (D) => { const f = K.clamp((D - 2500) / 16000); return { shadow: K.mix("#111828", "#2C3852", f * 0.7), mid: K.mix("#1D2638", "#34405A", f * 0.6), lit: K.mix("#36425E", "#4C5874", f * 0.4), base: K.mix("#0A0F1A", "#26304A", f * 0.7) }; };
    K.cloudField(g, L, M, { n: 48, seed: 203, az: [-85, 85], D: [2200, 22000], alt: [400, 900], W: [2600, 7000], H: [600, 1900], tall: 0.5, light: [-0.55, -0.83], maxW: 26, pal: (D) => pal(D) });
    // dark stratus smears between the masses break up the rows
    K.hstreaks(g, { x: 0, y: M.el(L.w / 2, 30), w: L.w, h: M.el(L.w / 2, 3) - M.el(L.w / 2, 30) }, 900, ["#0E1422", "#1A2236", "#243048"], 206, { len: [120, 420], width: [10, 30], alpha: [0.25, 0.55] });
    // heavy mammatus-like underside right above the strike: one dark mass with a slightly lit lower lip
    const [sx] = M.p(1.5, 6);
    K.cumulus(g, sx, M.el(sx, 8.5), 26 * M.dpx, 7 * M.dpx, { shadow: "#0C111D", mid: "#151C2C", lit: "#232D44", hi: "#3A4660", base: "#080C15" }, 207, [-0.5, -0.85], { towers: 2 });
    // rain veils hanging to the horizon (none in the strike column)
    for (let i = 0; i < 9; i++) {
      const az = r.range(-80, 75); if (Math.abs(az - 1.5) < 9) continue; const [x] = M.p(az, 4);
      K.rainVeil(g, x, M.el(x, r.range(4, 7)), M.el(x, -0.3), r.range(5, 12) * M.dpx, r() < 0.5 ? "#4A5874" : "#1C2436", 0.7, 210 + i, 0.22);
    }
    // below the horizon: fogged far sea (the 3D sea fades into this)
    const gr = g.createLinearGradient(0, yH, 0, L.h); gr.addColorStop(0, "#3A4763"); gr.addColorStop(0.15, "#2A3650"); gr.addColorStop(1, "#141C2C");
    g.fillStyle = gr; g.fillRect(0, yH, L.w, L.h - yH);
    K.ripples(g, L, yH + 1, L.h, ["#5A6884", "#1A2234", "#8A98B0"], 211, { n: 1800, alpha: [0.1, 0.35], len: [10, 60], wid: [1, 3] });
  },
};

const scudLayer = {
  name: "scud", depth: 320, brush: { r: 3, paper: 0.06 }, flash: 0.7, margin: 0.18,
  get blur() { return OPTS.closeup ? 14 : 0; },
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(221);
    for (let i = 0; i < 26; i++) {
      const az = r.range(-95, 95); if (Math.abs(az - 1.5) < 6 && r() < 0.7) continue;
      const el = r.range(3.5, 11), [x, y] = M.p(az, el), w = r.range(8, 20) * M.dpx, h = r.range(1.2, 3) * M.dpx;
      K.cumulus(g, x, y, w, h, { shadow: "#1A2133", mid: "#262F46", lit: "#3E4A66", base: "#121827" }, 222 + i, [-0.5, -0.86], { towers: 1, buds: 3, litW: 0.08 });
      // torn trailing wisps downwind (+X)
      g.globalAlpha = 0.35; for (let k = 0; k < 6; k++) K.stroke(g, x + w * 0.45 + k * w * 0.08, y + r.range(-h, h) * 0.3, r.range(-0.08, 0.08), w * r.range(0.2, 0.45), h * r.range(0.15, 0.35), "#232B40", 0.9, r);
      g.globalAlpha = 1;
    }
  },
};

const headLayer = {
  name: "headlands", depth: 700, brush: { r: 3, paper: 0.06 }, flash: 0.6,
  get blur() { return OPTS.closeup ? 14 : 0; },
  paint(g, L) {
    const M = K.wmap(L), deg = (e) => L.depth * Math.tan(e * Math.PI / 180), yH = L.yy(0);
    const lands = [
      { a0: -75, a1: -8, peak: -28, e: 2.3, seed: 231, col: { base: "#26314A", shadow: "#1E283E", mid: "#2C3852", lit: "#3E4A64", rim: "#8494B0", haze: "#3A4763" } },
      { a0: 14, a1: 52, peak: 31, e: 1.6, seed: 232, col: { base: "#2E3A54", shadow: "#28334C", mid: "#33405A", lit: "#3E4A64", rim: "#6E7C98", haze: "#3A4763" } },
      { a0: 48, a1: 95, peak: 70, e: 2.4, seed: 233, col: { base: "#202A40", shadow: "#1A2338", mid: "#27324A", lit: "#36425C", rim: "#6E7C98", haze: "#3A4763" } },
    ];
    for (const ld of lands) {
      const prof = (az) => { if (az < ld.a0 || az > ld.a1) return -60; const u = (az - ld.a0) / (ld.a1 - ld.a0), p = (ld.peak - ld.a0) / (ld.a1 - ld.a0);
        const env = u < p ? Math.pow(u / p, 0.6) : Math.pow((1 - u) / (1 - p), 0.9); return deg(ld.e * env * (0.85 + 0.25 * K.fbm1(az / 4, 4, ld.seed)) + (env > 0.02 ? 0.15 : -1)); };
      const rd = K.ridge(L, M, L.depth, prof, { crown: 0.5, crownWave: 6, seed: ld.seed });
      K.bushHill(g, L, rd, ld.col, ld.seed, { light: -1, dab: 4, n: 1500, rimA: 0.5, hazeH: 0.5, dabA: [0.1, 0.3], spurA: [0.15, 0.3] });
      // surf at the foot
      const r = K.rng(ld.seed + 5);
      for (let i = 0; i < 160; i++) { const az = r.range(ld.a0, ld.a1), x = M.x(az); if (!(rd.top(x) < yH - 1)) continue; g.globalAlpha = r.range(0.3, 0.8); K.stroke(g, x, yH - r.range(0, 0.25) * M.dpx, 0, r.range(0.5, 2.5) * M.dpx, r.range(1, 2.5), "#B8C4D6", 0.8, r); }
      g.globalAlpha = 1;
    }
    // a rain curtain sweeping across the left headland
    const [rx] = M.p(-40, 3); K.rainVeil(g, rx, M.el(rx, 8), M.el(rx, -0.2), 22 * M.dpx, "#3E4A66", 0.8, 239, 0.25);
    K.band(g, L.w, yH - 0.2 * M.dpx, 0.8 * M.dpx, "#3A4763", 0.7);
  },
};

// ------------------------------------------------------------------------------------------------ sea
function seaMesh(ctx) {
  const { THREE } = ctx;
  // fan grid around the camera side: azimuth -55..55 deg, radius 7..1600 m (geometric), centred at (0, 3.4)
  const NA = 220, NR = 190, pos = [], idx = [];
  for (let j = 0; j <= NR; j++) {
    const rr = 7 * Math.pow(1600 / 7, j / NR);
    for (let i = 0; i <= NA; i++) { const a = (-55 + 110 * i / NA) * Math.PI / 180; pos.push(Math.sin(a) * rr, 0, 3.4 - Math.cos(a) * rr); }
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const WAVES = `
    const int NW = 5;
    vec3 gerst(vec2 p, float t, out float crest) {
      vec4 W[NW]; // dir.x, dir.y, wavelength, amplitude
      W[0] = vec4(0.12, 1.0, 46.0, 0.95); W[1] = vec4(0.45, 0.9, 27.0, 0.5); W[2] = vec4(-0.3, 1.0, 15.0, 0.26);
      W[3] = vec4(0.8, 0.6, 7.5, 0.12); W[4] = vec4(-0.6, 0.8, 4.2, 0.06);
      vec3 o = vec3(0.0); crest = 0.0;
      for (int i = 0; i < NW; i++) {
        vec2 D = normalize(W[i].xy); float k = 6.2831853 / W[i].z, A = W[i].w, w = sqrt(9.8 * k), Q = 0.75 / (k * A * 5.0);
        float th = k * dot(D, p) - w * t + float(i) * 1.7;
        o.x += Q * A * D.x * cos(th); o.z += Q * A * D.y * cos(th); o.y += A * sin(th);
        crest += Q * A * k * sin(th);
      }
      return o;
    }`;
  const U = RIG_U;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uKeyDir: U.uKeyDir, uFogColor: U.uFogColor, uFlash: U.uFlash, uFlashColor: U.uFlashColor,
      uDeep: { value: new THREE.Color("#0B1220") }, uMid: { value: new THREE.Color("#1A2A3C") }, uSheen: { value: new THREE.Color("#4E5E7C") }, uFoam: { value: new THREE.Color("#C2CCDA") } },
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vH;
      ${WAVES}
      void main(){
        vec2 p = position.xz; float c0, c1, c2;
        vec3 o = gerst(p, uTime, c0);
        vec3 ox = gerst(p + vec2(0.4, 0.0), uTime, c1), oz = gerst(p + vec2(0.0, 0.4), uTime, c2);
        vec3 P0 = vec3(p.x, ${SEA_Y.toFixed(2)}, p.y) + o;
        vec3 Px = vec3(p.x + 0.4, ${SEA_Y.toFixed(2)}, p.y) + ox, Pz = vec3(p.x, ${SEA_Y.toFixed(2)}, p.y + 0.4) + oz;
        vN = normalize(cross(Pz - P0, Px - P0)); vCrest = c0; vH = o.y; vW = P0;
        gl_Position = projectionMatrix * viewMatrix * vec4(P0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uKeyDir; uniform vec3 uFogColor; uniform float uFlash; uniform vec3 uFlashColor;
      uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uSheen; uniform vec3 uFoam;
      varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vH;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 n = normalize(vN); vec3 V = cameraPosition - vW; float dist = length(V); V /= dist;
        vec3 nv = normalize((viewMatrix * vec4(n, 0.0)).xyz);
        float ndl = dot(nv, normalize(uKeyDir));
        vec3 col = mix(uDeep, uMid, smoothstep(0.2, 0.3, ndl));
        float fr = 1.0 - max(dot(n, V), 0.0);
        col = mix(col, uMid * 1.3, smoothstep(0.12, 0.32, n.z) * 0.55);
        col = mix(col, uSheen, smoothstep(0.78, 0.84, fr) * 0.75);
        col = mix(col, uDeep * 0.6, smoothstep(0.35, 0.2, fr) * 0.5);
        // whitecaps on the crests + wind streaks of foam, both fading with distance
        float far = smoothstep(60.0, 380.0, dist);
        float nz = vn(vW.xz * vec2(0.35, 0.9) + vec2(uTime * 0.6, 0.0)) * 0.6 + vn(vW.xz * 1.7) * 0.4;
        float brk = smoothstep(0.35, 0.65, vn(vW.xz * vec2(0.9, 3.2) + vec2(uTime * 0.4, 0.0)));
        float cap = smoothstep(0.4, 0.5, vCrest + (nz - 0.5) * 0.55 + vH * 0.15) * (0.35 + 0.65 * brk);
        float surf = smoothstep(-34.0, -12.0, vW.z) * smoothstep(0.5, 0.66, nz + vCrest * 0.6);
        float streak = smoothstep(0.72, 0.8, vn(vW.xz * vec2(0.18, 1.6) + vec2(uTime * 0.25, 0.0))) * smoothstep(0.0, 0.6, vCrest + 0.3) * 0.6;
        float foam = max(max(cap, streak), surf) * (1.0 - far * 0.85);
        col = mix(col, uFoam, foam);
        float fogK = smoothstep(15.0, 520.0, dist); fogK = pow(fogK, 0.75);
        col = mix(col, uFogColor, fogK);
        col = mix(col, uFlashColor, uFlash * 0.7);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.name = "sea"; m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------------------------------------ ground
const trackZ = (x) => 0.05 * Math.sin(x * 0.6) + 0.02 * x * 0.1;
function groundH(x, z) {
  const e = edgeZ(x), d = z - e;                                   // metres inland of the edge
  let y;
  if (d > 0) y = -0.5 * K.smooth(K.clamp((-0.6 - z) / (-0.6 - e)));
  else y = -0.5 - 1.9 * K.smooth(-d / 2.6) + 0.25 * K.fbm2(x * 1.1, z * 1.1, 3, 41) * K.smooth(-d / 0.6);
  if (z > -0.6) y = 0;
  y += 0.06 * K.fbm2(x * 0.6, z * 0.6, 3, 43) * K.smooth((Math.abs(z - trackZ(x)) - 0.5) / 0.8) * (d > 0.3 ? 1 : 0);
  y += Math.max(0, z - 4.5) * 0.04;
  return y;
}
function paintGround(g, w, h, A) {
  const tx = (x) => (x - A.x0) / (A.x1 - A.x0) * w, tz = (z) => (1 - (z - A.z0) / (A.z1 - A.z0)) * h, ppm = w / (A.x1 - A.x0);
  const r = K.rng(251);
  g.fillStyle = "#4E5638"; g.fillRect(0, 0, w, h);
  const cols = ["#3E4A30", "#56603C", "#6A6A44", "#7C7448", "#4A4E36", "#8A8050"];
  for (let i = 0; i < 26000; i++) {
    const x = K.lerp(A.x0, A.x1, r()), z = K.lerp(A.z0, A.z1, r()), b = K.fbm2(x * 0.5, z * 0.5, 3, 252);
    g.globalAlpha = r.range(0.3, 0.75); const s = r.range(0.04, 0.12) * ppm;
    K.stroke(g, tx(x), tz(z), r.range(-0.3, 0.3) + 0.2, s * 3.5, s * 0.7, cols[K.clamp(Math.floor((b * 0.5 + 0.5) * cols.length + r.range(-1, 1)), 0, cols.length - 1)], 0.8, r);
  }
  // rocky edge + cliff face
  for (let i = 0; i < 14000; i++) {
    const x = K.lerp(A.x0, A.x1, r()), z = edgeZ(x) + r.range(-3, 0.5); g.globalAlpha = r.range(0.4, 0.9);
    const s = r.range(0.04, 0.16) * ppm; K.blob(g, tx(x), tz(z), s, s * 0.6, r.pick(["#3A3C44", "#4A4C52", "#2C2E36", "#5A5A5E"]), 253 + i, 0.4, 7);
  }
  // the track: worn wet dirt and gravel
  const tw = (x) => 0.32 + 0.06 * K.noise1(x * 0.7, 254);
  const tp = new Path2D(); tp.moveTo(tx(A.x0), tz(trackZ(A.x0) + tw(A.x0)));
  for (let x = A.x0; x <= A.x1; x += 0.05) tp.lineTo(tx(x), tz(trackZ(x) + tw(x)));
  for (let x = A.x1; x >= A.x0; x -= 0.05) tp.lineTo(tx(x), tz(trackZ(x) - tw(x)));
  tp.closePath(); g.save(); g.clip(tp); g.globalAlpha = 1; g.fillStyle = "#5A4E42"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 16000; i++) { const x = K.lerp(A.x0, A.x1, r()), z = trackZ(x) + r.range(-0.35, 0.35); g.globalAlpha = r.range(0.4, 0.9); const s = r.range(0.006, 0.03) * ppm;
    g.fillStyle = r.pick(["#6E6254", "#4A4038", "#82786A", "#3C342E", "#5E6670"]); g.beginPath(); g.ellipse(tx(x), tz(z), s * 1.4, s, r() * 3, 0, 6.3); g.fill(); }
  // puddles reflecting the cold sky
  for (let i = 0; i < 26; i++) { const x = K.lerp(A.x0 + 2, A.x1 - 2, r()), z = trackZ(x) + r.range(-0.18, 0.18), s = r.range(0.06, 0.2) * ppm; g.globalAlpha = 0.85; K.blob(g, tx(x), tz(z), s * 1.8, s * 0.7, "#5C6A84", 260 + i, 0.3, 12); g.globalAlpha = 0.5; K.blob(g, tx(x) - s * 0.3, tz(z) - s * 0.1, s * 0.9, s * 0.25, "#8E9CB4", 261 + i, 0.3, 10); }
  g.restore(); g.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ build
const BASE = [skyLayer, scudLayer, headLayer];
export default {
  get layers() { return BASE; },
  build(ctx) {
    OPTS = ctx.opts ?? {};
    const { THREE, inkable } = ctx;
    const group = new THREE.Group(); group.name = "coast";
    const A = { x0: -12, x1: 12, z0: -8, z1: 9 };
    const tex = ctx.paintTexture(4096, 2900, (g, w, h) => paintGround(g, w, h, A), { r: 2, paper: 0.05 });
    const gmat = ctx.celMaterial({ map: tex, thresh: -0.25, rim: 0.2, shade: 0.8 });
    const T = P.terrain(ctx, { x0: -30, x1: 30, z0: -9, z1: 10, nx: 240, nz: 76, h: groundH, material: gmat,
      uv: (x, z) => [K.clamp((x - A.x0) / (A.x1 - A.x0)), K.clamp((z - A.z0) / (A.z1 - A.z0))], keep: (a, b, c, d) => Math.max(a, b, c, d) > -2.5 });
    group.add(T.mesh, P.inkOccluder(ctx, T.mesh));
    const heightAt = T.heightAt;
    const sea = OPTS.closeup ? null : seaMesh(ctx); if (sea) group.add(sea);
    const wind = [0.16, 0, 0.05];
    // tussock: clumps either side of the track, more toward the edge; a couple of big foreground ones for parallax
    const tg = P.tuftGeo(ctx, { blades: 22, seed: 7, base: "#4A4A30", tip: "#D8B878", width: 0.05, lean: 1.1 });
    const tus = P.scatter(700, 261, (r) => {
      const x = r.range(-9, 9), z = r.range(-3.6, 5); if (Math.abs(z - trackZ(x)) < 0.5 + r() * 0.2) return null; if (z < edgeZ(x) + 0.3) return null;
      if (Math.hypot(x, z) < 0.5 || (Math.abs(x) < 1.1 && z > 0.4 && z < 1.8)) return null; const s = r.range(0.16, 0.42); return { x, z, s, sy: s * r.range(0.8, 1.2), yaw: r.range(0, 6.3) };
    });
    tus.push({ x: 1.25, z: 2.0, s: 0.5, sy: 0.45, yaw: 1 }, { x: -1.2, z: 2.1, s: 0.46, sy: 0.42, yaw: 2 }, { x: 1.6, z: 2.6, s: 0.42, sy: 0.4, yaw: 3 });
    group.add(P.instanced(ctx, tg, tus, { heightAt, name: "tussock", sink: 0.04, thresh: -0.4, rim: 0.9, sway: { wind, h: 0.5 } }));
    const grass = P.scatter(1800, 262, (r) => { const x = r.range(-8, 8), z = r.range(-3.2, 4.5); if (Math.abs(z - trackZ(x)) < 0.36 || z < edgeZ(x) + 0.2) return null; const s = r.range(0.05, 0.11); return { x, z, s, yaw: r.range(0, 6.3) }; });
    group.add(P.instanced(ctx, P.tuftGeo(ctx, { blades: 9, seed: 8, base: "#40482E", tip: "#A8A06A", width: 0.07 }), grass, { heightAt, name: "grass", sink: 0.03, thresh: -0.4, rim: 0.8, sway: { wind: [0.12, 0, 0.04], h: 1 } }));
    // flax bushes thrashing in the wind (no ink: they sway)
    for (const [x, z, sd, n] of [[-2.4, -1.6, 3, 18], [2.9, -2.0, 4, 16], [-4.6, 0.9, 5, 14], [5.2, 1.6, 6, 14]]) {
      const f = P.flax(ctx, { x, z, y: heightAt(x, z), seed: sd, n, len: [0.8, 1.5], colors: ["#3E5030", "#4A5C34", "#34442A"], tipColor: "#7A8248", sway: { wind: [0.22, 0, 0.07], h: 1.2 } });
      group.add(f);
    }
    // boulders along the edge and in the surf (inked, solid)
    const colliders = [T.mesh]; const rr = K.rng(271);
    for (let i = 0; i < 26; i++) {
      const x = rr.range(-12, 12); if (Math.abs(x) < 0.9 && rr() < 0.7) continue;
      const z = edgeZ(x) + rr.range(-2.2, 0.4), s = rr.range(0.18, 0.7) * (z < edgeZ(x) - 1 ? 1.4 : 1);
      const m = new THREE.Mesh(P.rockGeo(ctx, { seed: 280 + i, detail: 1, flat: 0.7, jag: 0.3 }), ctx.celMaterial({ color: rr.pick(["#4A4C56", "#3C3E48", "#56565C"]), rim: 1, shade: 1 }));
      m.position.set(x, heightAt(x, z) - s * 0.2, z); m.scale.set(s * rr.range(1, 1.6), s, s * rr.range(0.9, 1.3)); m.rotation.y = rr.range(0, 6.3); m.name = "boulder"; m.userData.closed = true;
      inkable(m); group.add(m); colliders.push(m);
    }
    const cs = P.contactShadow(ctx, { size: [0.5, 0.4], a: 0.35, color: "#0A0E18" }); group.add(cs.mesh);
    const swayMats = []; group.traverse((o) => { if (o.material?.uniforms?.uWind) swayMats.push(o.material); });
    const t0 = ctx.shot.t0;
    group.updateMatrixWorld(true);   // nested props (marker post, signpost) must have world matrices before any render
    return {
      group, heightAt, colliders,
      update(t, t2, c) {
        if (sea) sea.material.uniforms.uTime.value = t2;
        for (const m of swayMats) { m.uniforms.uTime.value = t2 * 1.6; m.uniforms.uGust.value = 0.3 * Math.max(0, K.noise1(t2 * 1.3, 5)); }
        const scud = c.layers?.find((l) => l.name === "scud"); if (scud) scud.mesh.material.uniforms.uScroll.value.set(-(t - t0) * 0.012, 0);
        cs.update(c, heightAt);
      },
      dispose() {},
    };
  },
};
