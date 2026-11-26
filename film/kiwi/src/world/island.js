// S15 — the whole South Island from the sky at night (units: KILOMETRES, x east, z south; see core/geo.js).
// Land: the real coastline (loadGeo) with a painted night texture — relief-shaded Southern Alps with moonlit snow,
// Fiordland, Kaikoura and Nelson ranges, lakes, braided rivers, dark plains — at two resolutions (whole island + a
// sharper north patch for the 150 km start). Sea: dark swell, shallow shelf and a faint glow along the coast.
// A moonlit cloud deck (three painted layers, 11–24 km up) parts in a ring during opts.part. Land kept dark and calm
// so the orange trail lights (FX) read.
import * as THREE from "three";
import { rng, clamp, smooth, lerp } from "../core/time.js";
import { stroke, blob, shade, mix, rgb, hex } from "../core/paint.js";
import { loadGeo, proj } from "../core/geo.js";
import { makeNoise } from "./sky/kit.js";
import { paintedTexture, tileTexture } from "./sky/terrain.js";

const N = makeNoise(99);
const P = (a) => a.map(([lng, lat]) => proj(lng, lat));
const RANGES = [   // [polyline (lng,lat), half width km, amplitude]
  [P([[166.9, -45.95], [167.6, -45.2], [168.2, -44.8], [168.8, -44.4], [169.5, -44.0], [170.14, -43.6], [170.8, -43.2], [171.5, -42.9], [172.2, -42.5], [172.7, -42.1], [173.0, -41.85]]), 26, 1.0],
  [P([[166.7, -46.0], [167.2, -45.4], [167.8, -44.85]]), 34, 0.75],
  [P([[173.25, -42.3], [173.6, -42.05], [173.95, -41.85]]), 9, 0.72],
  [P([[172.6, -41.45], [173.3, -41.3], [173.55, -41.15]]), 15, 0.42],
  [P([[172.25, -40.95], [172.5, -41.4], [172.6, -41.8]]), 20, 0.45],
  [P([[169.3, -45.25], [169.9, -44.95], [170.4, -44.75]]), 28, 0.35],
];
const LAKES = [   // polylines (lng,lat), width km
  [P([[167.75, -45.42], [167.7, -45.25], [167.68, -45.1], [167.72, -44.95]]), 4.5], [P([[167.7, -45.2], [167.55, -45.22]]), 2], [P([[167.7, -45.05], [167.52, -45.0]]), 2],
  [P([[167.62, -45.58], [167.52, -45.5], [167.42, -45.55]]), 4], [P([[168.72, -45.33], [168.7, -45.12], [168.62, -45.04], [168.47, -45.0], [168.38, -44.87]]), 3],
  [P([[169.12, -44.72], [169.05, -44.6], [169.1, -44.45]]), 4], [P([[169.28, -44.6], [169.3, -44.42]]), 3.5], [P([[169.85, -44.3], [169.83, -44.15]]), 3],
  [P([[170.17, -44.18], [170.13, -43.98]]), 4.5], [P([[170.53, -44.05], [170.48, -43.86]]), 4], [P([[171.68, -43.12], [171.66, -43.05]]), 4],
];
const RIVERS = [P([[171.6, -43.0], [172.1, -43.25], [172.7, -43.4]]), P([[171.3, -43.3], [171.8, -43.6], [172.2, -43.9]]), P([[170.9, -43.6], [171.2, -43.9], [171.5, -44.15]]),
  P([[170.4, -44.6], [170.8, -44.78], [171.15, -44.92]]), P([[169.2, -45.0], [169.5, -45.6], [169.8, -46.35]]), P([[170.0, -43.9], [170.5, -44.2], [170.9, -44.5], [171.1, -44.8]])];
const segD = (x, z, L) => { let d = 1e9; for (let i = 0; i < L.length - 1; i++) { const [ax, az] = L[i], [bx, bz] = L[i + 1], vx = bx - ax, vz = bz - az, k = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)); d = Math.min(d, Math.hypot(x - ax - vx * k, z - az - vz * k)); } return d; };
const relief = (x, z) => {
  let h = 0;
  for (const [L, w, a] of RANGES) { const d = segD(x, z, L) / w; if (d < 2.5) h += a * Math.exp(-d * d) * (0.45 + 0.75 * N.ridged(x / 11, z / 11, 4)); }
  const [bx, bz] = proj(172.9, -43.75); const db = Math.hypot(x - bx, z - bz) / 16; h += 0.35 * Math.exp(-db * db) * (0.6 + 0.4 * N.ridged(x / 5, z / 5, 3));
  return h + 0.05 * N.fbm(x / 25, z / 25, 3);
};
const COL = { snowL: rgb("#93A8CC"), snowM: rgb("#5D7298"), snowS: rgb("#2C3B5A"), rockL: rgb("#3C5268"), rockM: rgb("#213548"), rockS: rgb("#0F1C2A"), low1: rgb("#12262A"), low2: rgb("#1A2F34"), forest: rgb("#0D1E21") };
const LIGHT = (() => { const v = [0.5, 0.65, 0.55]; const n = Math.hypot(...v); return v.map((c) => c / n); })();

/** Paint the land on a canvas: rect [X0, Z0, size km], S px per km. */
function paintLand(g, W, H, X0, Z0, S, rings) {
  const toPx = (x, z) => [(x - X0) * S, (z - Z0) * S];
  const land = new Path2D(); for (const ring of rings) { ring.forEach(([x, z], i) => { const [px, py] = toPx(x, z); i ? land.lineTo(px, py) : land.moveTo(px, py); }); land.closePath(); }
  g.fillStyle = "#0B1826"; g.fillRect(0, 0, W, H);
  // relief at low resolution: hillshade, tones, snow
  const f = 3, cw = Math.ceil(W / f), ch = Math.ceil(H / f), buf = new Uint8ClampedArray(cw * ch * 4), hs = 1.2 / S;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + (i * f) / S, z = Z0 + (j * f) / S, e = Math.max(hs, f / S);
    const h0 = relief(x, z), hx = (relief(x + e, z) - relief(x - e, z)) / (2 * e), hz = (relief(x, z + e) - relief(x, z - e)) / (2 * e);
    const K = 7, nx = -hx * K, nz = -hz * K, nl = Math.hypot(nx, 1, nz);
    const I = (nx * LIGHT[0] + LIGHT[1] + nz * LIGHT[2]) / nl + 0.05 * N.n(x / 1.5, z / 1.5);
    let c;
    if (h0 > 0.84 + 0.1 * N.n(x / 6, z / 6)) c = I > 0.86 ? COL.snowL : I > 0.68 ? COL.snowM : COL.snowS;
    else if (h0 > 0.24) c = I > 0.86 ? COL.rockL : I > 0.66 ? COL.rockM : COL.rockS;
    else { const v = 0.5 + 0.5 * N.fbm(x / 14, z / 14, 3); c = v > 0.62 ? COL.low2 : v > 0.42 ? COL.low1 : COL.forest; if (I < 0.7) c = c.map((q) => q * 0.8); }
    const k = (j * cw + i) * 4; buf[k] = c[0]; buf[k + 1] = c[1]; buf[k + 2] = c[2]; buf[k + 3] = 255;
  }
  const off = document.createElement("canvas"); off.width = cw; off.height = ch; off.getContext("2d").putImageData(new ImageData(buf, cw, ch), 0, 0);
  g.save(); g.clip(land); g.imageSmoothingEnabled = true; g.drawImage(off, 0, 0, cw * f, ch * f);
  // strokes along the contours in the local tone
  const r = rng(Math.round(S * 100)), n = Math.round((W * H) / 70);
  for (let s = 0; s < n; s++) {
    const px = r() * W, py = r() * H, i = Math.floor(px / f), j = Math.floor(py / f), k = (j * cw + i) * 4;
    const x = X0 + px / S, z = Z0 + py / S, e = 2 / S, hx = relief(x + e, z) - relief(x - e, z), hz = relief(x, z + e) - relief(x, z - e);
    g.globalAlpha = r.range(0.35, 0.7);
    stroke(g, px, py, Math.atan2(hx, -hz) + r.gauss() * 0.2, r.range(3, 10) * f, r.range(0.8, 2) * f, shade(hex([buf[k], buf[k + 1], buf[k + 2]]), (r() - 0.5) * 0.1), 0.7, r);
  }
  g.globalAlpha = 1;
  // braided rivers (faint silver), lakes (dark glass with a moon glint)
  g.lineCap = "round"; g.lineJoin = "round";
  for (const L of RIVERS) for (let b = 0; b < 3; b++) {
    g.strokeStyle = b ? "rgba(70,96,120,0.35)" : "rgba(40,62,84,0.6)"; g.lineWidth = Math.max(1, (b ? 0.5 : 1.6) * S); g.beginPath();
    for (let i = 0; i < L.length - 1; i++) for (let k = 0; k <= 12; k++) {
      const u = k / 12, x = L[i][0] + (L[i + 1][0] - L[i][0]) * u, z = L[i][1] + (L[i + 1][1] - L[i][1]) * u, m = 2.5 * N.n(x / 6, z / 6 + b);
      const [px, py] = toPx(x + m + (b - 1) * 0.6, z - m * 0.5 + (b - 1) * 0.4); i || k ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
  }
  for (const [L, w] of LAKES) for (const [col, ww] of [["#091626", w], ["#132A44", w * 0.55], ["#3E5E82", w * 0.12]]) {
    g.strokeStyle = col; g.lineWidth = Math.max(1, ww * S); g.beginPath(); L.forEach(([x, z], i) => { const [px, py] = toPx(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
  }
  g.restore();
  // a pale moonlit beach line
  g.strokeStyle = "rgba(70,100,120,0.55)"; g.lineWidth = Math.max(1, 0.6 * S); g.stroke(land);
}

const fogGLSL = `uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uCam;
vec3 fogIt(vec3 c, vec3 w){ return mix(c, uFog, smoothstep(uFogNear, uFogFar, length(w - uCam)) * 0.85); }
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }`;
const vert = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

export default {
  layers: [],
  async build(ctx) {
    const { rig, opts } = ctx;
    const geo = await loadGeo();
    const rings = geo.south;
    const group = new THREE.Group(); group.name = "island";
    const disposers = [];
    const fogU = () => ({ uFog: { value: new THREE.Color(rig.fog.color) }, uFogNear: { value: rig.fog.near }, uFogFar: { value: rig.fog.far }, uCam: { value: new THREE.Vector3() } });
    // ---------------------------------------------------------------- land textures
    const WH = [-380, -400, 800], DR = [130, -420, 280];   // whole island rect, north detail rect [x0, z0, size]
    const tLand = paintedTexture(ctx, 3072, 3072, (g, w, h) => paintLand(g, w, h, WH[0], WH[1], w / WH[2], rings), { r: 2, paper: 0.05 }); disposers.push(tLand.dispose);
    const tDet = paintedTexture(ctx, 2560, 2560, (g, w, h) => paintLand(g, w, h, DR[0], DR[1], w / DR[2], rings), { r: 2, paper: 0.05 }); disposers.push(tDet.dispose);
    const landMat = new THREE.ShaderMaterial({
      uniforms: { tLand: { value: tLand.texture }, tDet: { value: tDet.texture }, uR: { value: new THREE.Vector3(...WH) }, uD: { value: new THREE.Vector3(...DR) }, ...fogU() },
      vertexShader: vert,
      fragmentShader: `${fogGLSL}
        uniform sampler2D tLand; uniform sampler2D tDet; uniform vec3 uR; uniform vec3 uD; varying vec3 vW;
        void main(){
          vec2 a = (vW.xz - uR.xy) / uR.z, b = (vW.xz - uD.xy) / uD.z;
          vec3 c = texture2D(tLand, vec2(a.x, 1.0 - a.y)).rgb;
          float k = smoothstep(0.0, 0.12, b.x) * smoothstep(1.0, 0.88, b.x) * smoothstep(0.0, 0.12, b.y) * smoothstep(1.0, 0.88, b.y);
          if (k > 0.0) c = mix(c, texture2D(tDet, vec2(b.x, 1.0 - b.y)).rgb, k);
          gl_FragColor = vec4(fogIt(c, vW), 1.0);
        }`,
    });
    for (const ring of rings) {
      const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, landMat); m.name = "land"; m.renderOrder = 1; group.add(m);
    }
    // ---------------------------------------------------------------- coast mask (R = wide shelf, G = narrow glow)
    const CR = [-520, -540, 1080];
    const cc = document.createElement("canvas"); cc.width = cc.height = 1024; const cg = cc.getContext("2d");
    cg.fillStyle = "#000"; cg.fillRect(0, 0, 1024, 1024); cg.globalCompositeOperation = "lighter";
    const ringPath = () => { const p = new Path2D(); for (const ring of rings) { ring.forEach(([x, z], i) => { const px = ((x - CR[0]) / CR[2]) * 1024, py = ((z - CR[1]) / CR[2]) * 1024; i ? p.lineTo(px, py) : p.moveTo(px, py); }); p.closePath(); } return p; };
    const rp = ringPath();
    cg.filter = "blur(26px)"; cg.fillStyle = "rgb(255,0,0)"; cg.fill(rp); cg.fill(rp);
    cg.filter = "blur(3px)"; cg.strokeStyle = "rgb(0,255,0)"; cg.lineWidth = 3; cg.stroke(rp);
    const coast = new THREE.CanvasTexture(cc); coast.colorSpace = THREE.NoColorSpace; disposers.push(() => coast.dispose());
    // ---------------------------------------------------------------- sea
    const seaMat = new THREE.ShaderMaterial({
      uniforms: { tCoast: { value: coast }, uCR: { value: new THREE.Vector3(...CR) }, uT: { value: 0 }, ...fogU() },
      vertexShader: vert, depthWrite: false,
      fragmentShader: `${fogGLSL}
        uniform sampler2D tCoast; uniform vec3 uCR; uniform float uT; varying vec3 vW;
        void main(){
          vec2 q = (vW.xz - uCR.xy) / uCR.z; vec2 m = texture2D(tCoast, vec2(q.x, 1.0 - q.y)).rg;
          if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) m = vec2(0.0);
          vec3 col = mix(vec3(0.03, 0.06, 0.11), vec3(0.06, 0.14, 0.21), pow(m.r, 1.4));
          col += vec3(0.16, 0.3, 0.4) * m.g * 0.55;
          // swell: long moving bands, moonlit crests
          vec2 p = vW.xz;
          float sw = vn(p * 0.035 + vec2(uT * 0.25, uT * 0.1)) * 0.6 + vn(p * 0.11 - vec2(uT * 0.4, 0.0)) * 0.4;
          float bands = smoothstep(0.7, 0.9, 0.5 + 0.5 * sin(dot(p, vec2(0.21, 0.12)) + sw * 4.0 - uT * 1.2));
          col += vec3(0.1, 0.16, 0.24) * bands * 0.16 * (0.3 + 0.7 * vn(p * 0.03 + 3.0));
          gl_FragColor = vec4(fogIt(col, vW), 1.0);
        }`,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), seaMat); sea.position.y = -0.4; sea.renderOrder = -5; sea.name = "sea"; group.add(sea);
    // ---------------------------------------------------------------- cloud deck
    const tCloud = tileTexture(ctx, 2048, 2048, (g, w, h, wrap) => {   // R = moonlit, G = density (moon from the south-east = canvas lower right)
      const r = rng(55); g.fillStyle = "#000"; g.fillRect(-24, -24, w + 48, h + 48);
      const puff = (x, y, s, sd) => {
        const rr = rng(sd), n = 5 + Math.floor(rr() * 8), P2 = [];
        for (let i = 0; i < n; i++) P2.push([x + rr.gauss() * s * 0.6, y + rr.gauss() * s * 0.45, s * rr.range(0.35, 0.7)]);
        wrap(x, y, s * 2.2, (X, Y) => {
          for (const [px, py, pr] of P2) { blob(g, X + px - x, Y + py - y, pr * 1.05, pr * 0.95, "rgb(25,140,0)", sd + px, 0.2, 14); }
          for (const [px, py, pr] of P2) { blob(g, X + px - x + pr * 0.18, Y + py - y + pr * 0.22, pr * 0.78, pr * 0.7, "rgb(120,215,0)", sd + py, 0.25, 12); }
          if (rr() < 0.5) { const [px, py, pr] = P2[0]; blob(g, X + px - x + pr * 0.3, Y + py - y + pr * 0.35, pr * 0.55, pr * 0.4, "rgb(200,240,0)", sd + pr, 0.3, 10); }
        });
      };
      for (let i = 0; i < 600; i++) { const x = r() * w, y = r() * h; wrap(x, y, 160, (X, Y) => { g.globalAlpha = r.range(0.25, 0.5); stroke(g, X, Y, 0.4 + r.gauss() * 0.2, r.range(80, 260), r.range(14, 40), r() < 0.5 ? "rgb(60,110,0)" : "rgb(100,150,0)", 0.8, r); }); }
      g.globalAlpha = 1;
      for (let i = 0; i < 150; i++) { const x = r() * w, y = r() * h; for (let k = 0; k < 6; k++) puff(x + r.gauss() * 90, y + r.gauss() * 60, r.range(18, 60), i * 10 + k); }
      g.globalAlpha = 1;
    }, { r: 2, paper: 0 }, { m: 40, aniso: 4 });
    disposers.push(tCloud.dispose);
    const part = opts.part ?? [ctx.shot.t0, ctx.shot.t1];
    const C0 = [255, -325], C1 = [-15, 10];
    const decks = [[11, 460, 1600, 0.62, 0, 0.0], [17, 560, 1900, 0.8, 0.37, 0.08], [24, 400, 1400, 1.0, 0.71, 0.16]].map(([y, t1, t2, lum, off, lead]) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { tC: { value: tCloud.texture }, uT1: { value: t1 }, uT2: { value: t2 }, uLum: { value: lum }, uOff: { value: new THREE.Vector2(off * 900, off * 400) }, uC: { value: new THREE.Vector2() }, uR: { value: 0 }, uT: { value: 0 }, uOp: { value: 1 }, ...fogU() },
        vertexShader: vert, transparent: true, depthWrite: false,
        fragmentShader: `${fogGLSL}
          uniform sampler2D tC; uniform float uT1; uniform float uT2; uniform float uLum; uniform vec2 uOff; uniform vec2 uC; uniform float uR; uniform float uT; uniform float uOp; varying vec3 vW;
          void main(){
            vec2 d = vW.xz - uC; float dl = length(d);
            float ds = max(dl - uR * 0.7, 0.0) + uR * 0.7 * smoothstep(uR * 1.6 + 1.0, uR * 0.7, dl) * 0.0;   // clouds pushed outward by the opening ring
            vec2 ps = uC + (dl > 1e-3 ? d / dl * ds : vec2(0.0)) + uOff + vec2(uT * 2.5, uT * 0.8);
            vec4 a = texture2D(tC, vec2(ps.x / uT1, 1.0 - ps.y / uT1));
            vec4 b = texture2D(tC, vec2(ps.x / uT2 + 0.37, 1.0 - ps.y / uT2 + 0.11));
            vec4 c = texture2D(tC, vec2(ps.x / (uT1 * 0.21) + 0.53, 1.0 - ps.y / (uT1 * 0.21) + 0.29));   // fine detail octave
            float dens = a.g * (0.45 + 0.85 * b.g) * (0.8 + 0.35 * c.g);
            float lit = clamp(mix(a.r, b.r, 0.25) * (0.75 + 0.5 * c.r) + 0.15 * (c.r - 0.4), 0.0, 1.0);
            float edge = (b.g - 0.5) * 70.0 + (a.g - 0.5) * 25.0;
            float ring = smoothstep(uR * 0.96, uR * 1.08 + 12.0, dl + edge);
            float al = smoothstep(0.18, 0.62, dens) * ring * uOp;
            vec3 col = mix(vec3(0.04, 0.065, 0.13), vec3(0.58, 0.68, 0.86), pow(lit, 1.5)) * uLum;
            col += vec3(0.25, 0.3, 0.42) * smoothstep(uR * 1.25 + 30.0, uR * 1.02, dl) * step(1.0, uR) * lit * 0.5;   // piled-up, lit rim of the opening
            gl_FragColor = vec4(fogIt(col, vW), al);
          }`,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200).rotateX(-Math.PI / 2), mat); m.position.set(-15, y, 10); m.renderOrder = 10 + y; m.name = "clouds"; group.add(m);
      return { m, mat, lead };
    });
    return {
      group, heightAt: () => 0, colliders: [],
      update(t, t2, c) {
        seaMat.uniforms.uT.value = t2; seaMat.uniforms.uCam.value.copy(c.camera.position); landMat.uniforms.uCam.value.copy(c.camera.position);
        for (const d of decks) {
          const k = clamp(((t2 - part[0]) / (part[1] - part[0])) * (1 + d.lead)), e = 1 - Math.pow(1 - k, 2.2), ce = smooth(k);
          const U = d.mat.uniforms; U.uR.value = 560 * e; U.uC.value.set(lerp(C0[0], C1[0], ce), lerp(C0[1], C1[1], ce)); U.uT.value = t2; U.uCam.value.copy(c.camera.position);
        }
      },
      dispose() { disposers.forEach((f) => f()); },
    };
  },
};
