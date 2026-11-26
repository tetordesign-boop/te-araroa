// RIVER — a NZ swing bridge over a river in flood (S05, S10b). The river runs along Z under the bridge (deck along X
// at y = 0); cameras hang beside it on the downstream (+Z) side looking upstream into the gorge.
// Layers: rain sky, far valley ridges in cloud, the gorge walls (painted in true perspective: wet bush, rock, falls,
// spray mist). 3D: flood river (brown, scrolling foam streaks, standing waves, faceted cel normals, fog), rocky banks,
// the bridge (planks, stringers, crossbeams, hangers, wire-rope handrails, diamond wire mesh), contact shadow.
// River surface: mean y = RIVER_Y (-2.2), flowing toward +Z at ~4 m/s.
import * as K from "./land/kit.js";
import * as P from "./land/props.js";
import { RIG_U } from "../core/cel.js";

let OPTS = {};
export const RIVER_Y = -2.2;
const deckY = (x) => 0.01 * x * x;
const HALF = 0.32, SPAN = 6.2;
const FOG = "#52676B";

// ------------------------------------------------------------------------------------------------ painted gorge
const bankX = (side, z) => side * (5.0 + 0.03 * Math.max(0, -z) + 1.1 * Math.sin(z * 0.045 + side));
const ridgeH = (side, z) => 30 + 20 * K.fbm1(z * 0.025, 3, side > 0 ? 7 : 3) + Math.max(0, -z) * 0.12;
function wallPt(side, z, u) {
  const H = ridgeH(side, z), xb = bankX(side, z);
  return [xb + side * H * (0.18 * u + 0.75 * u * u * u), RIVER_Y - 0.3 + H * Math.pow(u, 0.85), z];
}
const fogMix = (c, d, k0 = 12, k1 = 380) => K.mix(c, FOG, Math.pow(K.clamp((d - k0) / (k1 - k0)), 0.75));

const gorgeLayer = {
  name: "gorge", depth: 45, brush: { r: 3, paper: 0.06 }, flash: 0.5,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const r = K.rng(301), C = L.cam;
    const Z0 = -26, Z1 = -175, NZ = 60, NU = 10;
    const zs = Array.from({ length: NZ + 1 }, (_, i) => Z0 + (Z1 - Z0) * Math.pow(i / NZ, 1.25));
    // end wall where the river bends away (faces the camera)
    const ze = -168;
    for (let i = 0; i < 14; i++) {
      const x0 = -60 + i * 5, x1 = x0 + 5.5, h0 = 42 + 8 * K.noise1(x0 * 0.1, 31), h1 = 42 + 8 * K.noise1(x1 * 0.1, 31);
      const d = Math.hypot(x0 - C.x, ze - C.z), c = fogMix(K.mix("#2E4038", "#3E5446", K.clamp(0.4 + K.noise1(i, 32) * 0.3)), d);
      K.polyW(g, L, [[x0, RIVER_Y - 1, ze], [x1, RIVER_Y - 1, ze], [x1, RIVER_Y + h1, ze - 25], [x0, RIVER_Y + h0, ze - 25]], c);
    }
    // the two walls, far to near: strips coloured by facing (key from the upper left) and distance fog
    for (let i = NZ - 1; i >= 0; i--) {
      const za = zs[i + 1], zb = zs[i];
      for (const side of [-1, 1]) {
        for (let j = 0; j < NU; j++) {
          const u0 = j / NU, u1 = (j + 1) / NU;
          const pa = wallPt(side, za, u0), pb = wallPt(side, zb, u0), pc = wallPt(side, zb, u1), pd = wallPt(side, za, u1);
          const lit = K.clamp((side > 0 ? 0.62 : 0.22) + u0 * 0.35 + K.noise1(za * 0.08 + j, side * 5) * 0.18);
          const base = lit > 0.6 ? "#3C5444" : lit > 0.38 ? "#2C4036" : "#1E2E2A";
          const d = Math.hypot(pb[0] - C.x, pb[1] - C.y, zb - C.z);
          K.polyW(g, L, [pa, pb, pc, pd], fogMix(base, d));
        }
      }
    }
    // scoured rock at the base of the walls: grey bands with vertical striations
    for (let i = NZ - 1; i >= 0; i--) for (const side of [-1, 1]) {
      const za = zs[i + 1], zb = zs[i], uTop = 0.1 + 0.08 * K.noise1(za * 0.1, side * 9);
      const pa = wallPt(side, za, 0), pb = wallPt(side, zb, 0), pc = wallPt(side, zb, uTop), pd = wallPt(side, za, uTop);
      const d = Math.hypot(pb[0] - C.x, pb[1] - C.y, zb - C.z);
      K.polyW(g, L, [pa, pb, pc, pd], fogMix(side > 0 ? "#5A605C" : "#3A403E", d));
      for (let k = 0; k < 3; k++) { const u = r.range(0, uTop), q0 = K.proj(L, wallPt(side, K.lerp(za, zb, r()), u)), q1 = q0 && K.proj(L, wallPt(side, K.lerp(za, zb, r()), u * 0.3)); if (!q1) continue;
        g.strokeStyle = fogMix(r() < 0.5 ? "#2A302E" : "#7A807A", d); g.globalAlpha = 0.5; g.lineWidth = Math.max(1, q0[3] * 0.15); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke(); }
      g.globalAlpha = 1;
    }
    // bush canopy: dense crowns, each with a shadow underside, body and a lit cap toward the key (upper left)
    const dabs = [];
    for (let i = 0; i < 26000; i++) {
      const side = r() < 0.5 ? -1 : 1, z = K.lerp(Z0 - 2, Z1, Math.pow(r(), 1.2)), u = 0.1 + Math.pow(r(), 0.85) * 0.9;
      dabs.push([side, z, Math.min(1, u), r()]);
    }
    dabs.sort((a, b) => a[1] - b[1] || b[2] - a[2]);
    for (const [side, z, u, k] of dabs) {
      const p = wallPt(side, z, u), q = K.proj(L, p); if (!q) continue;
      const [x, y, d, sc] = q; if (x < -150 || x > L.w + 150 || y < -150 || y > L.h + 150) continue;
      const s = (0.7 + k * 1.6) * sc * 0.5; if (s < 1) continue;
      const lit = K.clamp((side > 0 ? 0.62 : 0.3) + u * 0.25 + K.noise2(z * 0.05, u * 4, side + 7) * 0.35);
      const seed = (k * 1e6) | 0;
      g.globalAlpha = 0.9; K.blob(g, x + s * 0.1, y + s * 0.25, s * 1.05, s * 0.75, fogMix("#132019", d), seed, 0.35, 9);
      K.blob(g, x, y, s * 0.92, s * 0.68, fogMix(lit > 0.55 ? "#36503C" : "#29402F", d), seed + 1, 0.4, 9);
      if (lit > 0.35) { g.globalAlpha = 0.85; K.blob(g, x - s * 0.22, y - s * 0.24, s * 0.55, s * 0.36, fogMix(lit > 0.65 ? "#6A8A64" : "#4C684E", d), seed + 2, 0.4, 8); }
      if (lit > 0.7 && k > 0.6) { g.globalAlpha = 0.7; K.blob(g, x - s * 0.32, y - s * 0.36, s * 0.22, s * 0.12, fogMix("#9AB48C", d), seed + 3, 0.4, 7); }
    }
    g.globalAlpha = 1;
    // low cloud hanging in the gorge at a few heights (depth layering)
    for (const [z, hgt, a] of [[-150, 24, 0.3], [-110, 14, 0.22], [-70, 30, 0.14]]) {
      const pl = K.proj(L, [-60, RIVER_Y + hgt, z]), pr = K.proj(L, [60, RIVER_Y + hgt, z]); if (!pl || !pr) continue;
      const hh = 3 * pl[3]; g.globalAlpha = 1;
      for (let k = 0; k < 40; k++) { const xx = K.lerp(pl[0], pr[0], r()); g.globalAlpha = a * r.range(0.3, 0.8); K.stroke(g, xx, K.lerp(pl[1], pr[1], 0.5) + r.gauss() * hh * 0.3, r.range(-0.05, 0.05), hh * r.range(3, 8), hh * r.range(0.3, 0.7), "#8C9E9E", 0.9, r); }
      g.globalAlpha = 1;
    }
    // tree ferns / emergent crowns on the rims
    for (let i = 0; i < 70; i++) {
      const side = r() < 0.5 ? -1 : 1, z = K.lerp(Z0, Z1, Math.pow(r(), 1.3)), p = wallPt(side, z, r.range(0.85, 1)), q = K.proj(L, p); if (!q) continue;
      const [x, y, d, sc] = q, s = r.range(2.5, 5) * sc * 0.5, c = fogMix("#1E2E28", d);
      g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.08); g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-0.2, 0.2) * s, y - s * 1.6); g.stroke();
      for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.36; g.globalAlpha = 0.9; K.stroke(g, x + Math.cos(a) * s * 0.55, y - s * 1.6 + Math.sin(a) * s * 0.35 + s * 0.15, a * 0.6, s * 1.1, s * 0.14, c, 0.9, r); }
      g.globalAlpha = 1;
    }
    // spray mist over the river and rain veils
    const yR = K.proj(L, [C.x, RIVER_Y, C.z - 60])?.[1] ?? L.h * 0.6;
    K.band(g, L.w, yR - 1.5 * L.ppm, 5 * L.ppm, "#8FA2A2", 0.3);
  },
};

const valleyLayer = {
  name: "valley", depth: 300, brush: { r: 3, paper: 0.06 }, flash: 0.5,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const M = K.wmap(L), deg = (e) => L.depth * Math.tan(e * Math.PI / 180);
    const ranges = [
      { e: (az) => 9 + 5 * K.fbm1(az / 9, 4, 341) + az * 0.06, col: { base: "#4E6260", shadow: "#465A58", mid: "#52666A", lit: "#62767A", rim: "#9AAEAE", haze: "#6A7E7E" }, seed: 341 },
      { e: (az) => 5.5 + 4 * K.fbm1(az / 7, 4, 342) - az * 0.04, col: { base: "#3A4E48", shadow: "#30443E", mid: "#3E544C", lit: "#4E6658", rim: "#8EA4A0", haze: "#5E7272" }, seed: 342 },
    ];
    for (const R of ranges) {
      const rd = K.ridge(L, M, L.depth, (az) => deg(R.e(az)), { crown: 2.5, crownWave: 8, seed: R.seed });
      K.bushHill(g, L, rd, R.col, R.seed, { light: -1, dab: 5, n: 2500, rimA: 0.3, hazeH: 0.6, dabA: [0.1, 0.3] });
      // cloud drifting across the ridge
      const r = K.rng(R.seed + 3);
      for (let i = 0; i < 6; i++) { const [x, y] = M.p(r.range(-50, 50), R.e(0) * r.range(0.5, 0.9)); K.streakCloud(g, x, y, r.range(12, 30) * M.dpx, r.range(1, 2.5) * M.dpx, ["#7E9090", "#8A9C9C", "#6E8282"], R.seed + 10 + i, 0.6); }
    }
  },
};

const skyLayer = {
  name: "sky", depth: 900, brush: { r: 4, paper: 0.07 }, flash: 0.45,
  get blur() { return OPTS.closeup ? 10 : 0; },
  paint(g, L) {
    const M = K.wmap(L), r = K.rng(351);
    K.skyGrad(g, L, M, [[70, "#16232A"], [40, "#22323A"], [20, "#3A4C52"], [8, "#566A6E"], [0, "#62777A"], [-10, "#4A5E62"]]);
    K.cloudField(g, L, M, { n: 50, seed: 352, az: [-80, 80], D: [1200, 14000], alt: [500, 900], W: [2000, 6000], H: [300, 900], light: [-0.5, -0.85], maxW: 30,
      pal: (D) => { const f = K.clamp((D - 1500) / 10000); return { shadow: K.mix("#26363E", "#4E6266", f), mid: K.mix("#34464C", "#5A6E72", f), lit: K.mix("#4E6268", "#6E8286", f), base: K.mix("#1E2C32", "#465A5E", f) }; } });
    K.hstreaks(g, { x: 0, y: 0, w: L.w, h: M.el(L.w / 2, 2) }, 1200, ["#2A3A42", "#3E5056", "#566A6E"], 353, { len: [80, 300], width: [8, 24], alpha: [0.15, 0.35] });
    for (let i = 0; i < 10; i++) { const [x] = M.p(r.range(-70, 70), 5); K.rainVeil(g, x, M.el(x, r.range(10, 25)), M.el(x, 0), r.range(6, 14) * M.dpx, "#2E3E44", 0.5, 360 + i, -0.15); }
  },
};

// ------------------------------------------------------------------------------------------------ 3D: river
function riverMesh(ctx) {
  const { THREE } = ctx;
  const NX = 44, NZ = 230, pos = [], idx = [];
  for (let j = 0; j <= NZ; j++) { const z = 12 - 190 * Math.pow(j / NZ, 1.7); for (let i = 0; i <= NX; i++) pos.push(-11 + 22 * i / NX, RIVER_Y, z); }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const U = RIG_U;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uKeyDir: U.uKeyDir, uFogColor: U.uFogColor, uFlash: U.uFlash, uFlashColor: U.uFlashColor },
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec3 vW; varying float vH; varying vec3 vN;
      float H(vec2 p, float f) {
        float stand = 0.2 * sin(p.x * 1.1 + 0.8 * sin(p.y * 0.17)) * sin(p.y * 0.75 + 0.5 * sin(p.x * 0.6));
        float trav = 0.13 * sin((p.y - f) * 0.48 + p.x * 0.35) + 0.06 * sin((p.y - f * 1.15) * 1.25 - p.x * 0.8) + 0.28 * sin((p.y - f * 0.85) * 0.11 + 1.3);
        return (stand + trav) * (1.0 + smoothstep(3.0, 4.6, abs(p.x)) * 0.6);
      }
      void main(){
        vec3 p = position; float f = uTime * 4.2; vec2 q = p.xz;
        float h = H(q, f), hx = H(q + vec2(0.15, 0.0), f), hz = H(q + vec2(0.0, 0.15), f);
        vN = normalize(vec3(-(hx - h) / 0.15, 1.0, -(hz - h) / 0.15));
        p.y += h; vH = h; vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uKeyDir; uniform vec3 uFogColor; uniform float uFlash; uniform vec3 uFlashColor;
      varying vec3 vW; varying float vH; varying vec3 vN;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 n = normalize(vN), V = cameraPosition - vW; float dist = length(V); V /= dist;
        vec3 nv = normalize((viewMatrix * vec4(n, 0.0)).xyz);
        float ndl = dot(nv, normalize(uKeyDir));
        vec3 col = mix(vec3(0.17, 0.16, 0.13), vec3(0.33, 0.3, 0.245), smoothstep(0.2, 0.3, ndl));
        float fr = 1.0 - max(dot(n, V), 0.0);
        col = mix(col, vec3(0.46, 0.53, 0.53), smoothstep(0.72, 0.8, fr) * 0.55);
        float f = uTime * 4.2;
        float streak = vn(vec2(vW.x * 3.0, (vW.z - f) * 0.07)) * 0.6 + vn(vec2(vW.x * 9.0, (vW.z - f * 1.05) * 0.22)) * 0.4;
        float bank = smoothstep(3.2, 4.8, abs(vW.x));
        float foam = smoothstep(0.7 - bank * 0.18, 0.74 - bank * 0.18, streak) * 0.85;
        foam = max(foam, smoothstep(0.38, 0.46, vH + (vn(vW.xz * vec2(2.5, 0.8) - vec2(0.0, f * 0.6)) - 0.5) * 0.3) * 0.85);
        float dark = smoothstep(0.66, 0.7, vn(vec2(vW.x * 5.0 + 3.0, (vW.z - f) * 0.12))) * 0.35;
        col = mix(col, col * 0.6, dark);
        foam *= 1.0 - smoothstep(80.0, 220.0, dist) * 0.7;
        col = mix(col, vec3(0.84, 0.84, 0.8), foam);
        col = mix(col, uFogColor, pow(smoothstep(8.0, 320.0, dist), 0.8));
        col = mix(col, uFlashColor, uFlash * 0.7);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.name = "river"; m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------------------------------------ 3D: bridge
function bridge(ctx) {
  const { THREE, inkable } = ctx;
  const grp = new THREE.Group(); grp.name = "swing-bridge";
  const wood = ctx.celMaterial({ color: "#7A6A58", rim: 0.8 }), steel = ctx.celMaterial({ color: "#5E666A", rim: 1, hi: 0.4 }), wire = ctx.celMaterial({ color: "#7E8890", rim: 1, hi: 0.5 });
  // planks (instanced), top at deckY(x)
  const pw = 0.085, gap = 0.013, np = Math.floor((2 * SPAN) / (pw + gap));
  const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(pw, 0.03, HALF * 2), wood, np); planks.name = "planks";
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), rr = K.rng(371);
  for (let i = 0; i < np; i++) {
    const x = -SPAN + (i + 0.5) * (pw + gap); e.set(rr.range(-0.01, 0.01), rr.range(-0.012, 0.012), Math.atan(0.02 * x));
    m4.compose(new THREE.Vector3(x, deckY(x) - 0.015 - rr.range(0, 0.002), rr.range(-0.006, 0.006)), q.setFromEuler(e), new THREE.Vector3(1, 1, 1)); planks.setMatrixAt(i, m4);
  }
  grp.add(planks);
  // sagging members: stringers, cables (tubes along curves)
  const curve = (yOff, z, n = 40) => new THREE.CatmullRomCurve3(Array.from({ length: n + 1 }, (_, i) => { const x = -SPAN - 0.3 + (2 * SPAN + 0.6) * i / n; return new THREE.Vector3(x, deckY(x) + yOff, z); }));
  for (const z of [-HALF + 0.03, HALF - 0.03]) { const s = new THREE.Mesh(new THREE.TubeGeometry(curve(-0.06, z), 60, 0.03, 6), steel); s.name = "stringer"; grp.add(s); }
  for (const z of [-HALF - 0.03, HALF + 0.03]) {
    const c = new THREE.Mesh(new THREE.TubeGeometry(curve(1.12, z), 80, 0.013, 7), wire); c.name = "handrail-cable"; grp.add(c);
    const c2 = new THREE.Mesh(new THREE.TubeGeometry(curve(0.02, z), 80, 0.008, 6), wire); c2.name = "edge-wire"; grp.add(c2);
  }
  // crossbeams + hangers every metre
  for (let x = -SPAN; x <= SPAN + 1e-6; x += 1) {
    const cb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, HALF * 2 + 0.16), steel); cb.position.set(x, deckY(x) - 0.06, 0); cb.name = "crossbeam"; grp.add(cb);
    for (const z of [-HALF - 0.03, HALF + 0.03]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1.2, 5), wire); h.position.set(x, deckY(x) + 0.54, z); h.name = "hanger"; grp.add(h); }
  }
  inkable(grp);
  // diamond wire mesh on both sides (thin lines, seen through)
  const seg = [], pitch = 0.1, Hm = 1.08;
  for (const z of [-HALF - 0.02, HALF + 0.02]) for (const dir of [1, -1]) {
    for (let x0 = -SPAN - Hm; x0 <= SPAN + Hm; x0 += pitch) {
      let prev = null;
      for (let k = 0; k <= 6; k++) {
        const v = k / 6 * Hm, x = x0 + dir * v; const p = Math.abs(x) <= SPAN ? [x, deckY(x) + 0.03 + v, z] : null;
        if (p && prev) seg.push(...prev, ...p); prev = p;
      }
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
  const mesh = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: "#2A3438", transparent: true, opacity: 0.85 })); mesh.name = "wire-mesh";
  grp.add(mesh);
  // invisible deck collider following the sag (top = plank tops)
  const cg = [], ci = []; const n = 50;
  for (let i = 0; i <= n; i++) { const x = -SPAN + 2 * SPAN * i / n, y = deckY(x); cg.push(x, y, -HALF, x, y, HALF, x, y - 0.06, -HALF, x, y - 0.06, HALF); }
  for (let i = 0; i < n; i++) { const a = i * 4, b = a + 4; ci.push(a, a + 1, b, a + 1, b + 1, b, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3, a, b, a + 2, a + 2, b, b + 2, a + 1, a + 3, b + 1, a + 3, b + 3, b + 1); }
  ci.push(0, 2, 1, 1, 2, 3, n * 4, n * 4 + 1, n * 4 + 2, n * 4 + 1, n * 4 + 3, n * 4 + 2);
  const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.Float32BufferAttribute(cg, 3)); dg.setIndex(ci); dg.computeVertexNormals();
  const deck = new THREE.Mesh(dg, new THREE.MeshBasicMaterial()); deck.visible = false; deck.name = "deck"; deck.userData.closed = true; grp.add(deck);
  return { group: grp, deck };
}

// ------------------------------------------------------------------------------------------------ 3D: banks
function bankH(x, z) {
  const ax = Math.abs(x), wob = 0.5 * Math.sin(z * 0.3 + x) + 0.3 * K.fbm2(x * 0.4, z * 0.4, 3, 381);
  return RIVER_Y - 0.5 + Math.max(0, ax - 4.4 + wob * 0.6) * 0.95 + Math.max(0, ax - 7.5) * 0.5 + wob * 0.25 * K.smooth((ax - 4.5) / 1.5);
}
function paintBank(g, w, h, A) {
  const tx = (x) => (x - A.x0) / (A.x1 - A.x0) * w, tz = (z) => (1 - (z - A.z0) / (A.z1 - A.z0)) * h, ppm = w / (A.x1 - A.x0), r = K.rng(391);
  g.fillStyle = "#2A3830"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30000; i++) {
    const x = K.lerp(A.x0, A.x1, r()), z = K.lerp(A.z0, A.z1, r()), y = bankH(x, z) - RIVER_Y; const s = r.range(0.05, 0.2) * ppm;
    const wet = y < 1.0, c = wet ? r.pick(["#3E4442", "#4E5450", "#2E3432", "#5C605A"]) : r.pick(["#26382C", "#34483A", "#3E5640", "#4A6248", "#2A3A34"]);
    g.globalAlpha = r.range(0.5, 0.9); K.blob(g, tx(x), tz(z), s, s * 0.7, c, 392 + i, 0.4, 7);
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ build
const BASE = [skyLayer, valleyLayer, gorgeLayer];
export default {
  get layers() { return BASE; },
  build(ctx) {
    OPTS = ctx.opts ?? {};
    const { THREE, inkable } = ctx;
    const group = new THREE.Group(); group.name = "river";
    const A = { x0: -13, x1: 13, z0: -16, z1: 12 };
    const tex = ctx.paintTexture(2048, 2048, (g, w, h) => paintBank(g, w, h, A), { r: 2, paper: 0.05 });
    const bmat = ctx.celMaterial({ map: tex, thresh: 0.0, rim: 0.5 });
    const T = P.terrain(ctx, { x0: -13, x1: 13, z0: -16, z1: 12, nx: 104, nz: 112, h: bankH, material: bmat, keep: (a, b, c, d) => Math.max(a, b, c, d) > RIVER_Y - 0.25 });
    T.mesh.name = "banks"; group.add(T.mesh, P.inkOccluder(ctx, T.mesh));
    const river = riverMesh(ctx); group.add(river, P.inkOccluder(ctx, river));
    const B = bridge(ctx); group.add(B.group);
    // boulders at the water's edge, dripping ferns on the banks
    const colliders = [T.mesh, B.deck]; const rr = K.rng(401);
    for (let i = 0; i < 30; i++) {
      const side = rr() < 0.5 ? -1 : 1, z = rr.range(-15, 10), x = side * rr.range(3.9, 6.5), s = rr.range(0.3, 1.0);
      const m = new THREE.Mesh(P.rockGeo(ctx, { seed: 410 + i, detail: 1, flat: 0.75, jag: 0.25 }), ctx.celMaterial({ color: rr.pick(["#545A58", "#4A504E", "#60645E"]), rim: 1 }));
      m.position.set(x, Math.max(bankH(x, z), RIVER_Y - 0.3) - s * 0.25, z); m.scale.set(s * rr.range(1, 1.5), s * 0.8, s); m.rotation.y = rr.range(0, 6.3); m.name = "boulder"; m.userData.closed = true;
      inkable(m); group.add(m); colliders.push(m);
    }
    for (let i = 0; i < 22; i++) {
      const side = rr() < 0.5 ? -1 : 1, z = rr.range(-14, 9), x = side * rr.range(4.9, 9);
      group.add(P.fern(ctx, { x, z, y: bankH(x, z), seed: 420 + i, n: 12, len: [0.8, 1.4], colors: ["#2E5230", "#3A6038", "#284828"], tip: "#5E8A48" }));
    }
    for (const [x, z, sd] of [[-5.0, 1.3, 431], [-5.4, -1.6, 432], [5.1, 0.9, 433]]) group.add(P.fern(ctx, { x, z, y: bankH(x, z), seed: sd, n: 13, len: [0.7, 1.2], colors: ["#2E5230", "#3A6038", "#284828"], tip: "#5E8A48" }));
    const cs = P.contactShadow(ctx, { size: [0.46, 0.36], a: 0.4, color: "#101814" }); group.add(cs.mesh);
    const heightAt = (x, z) => (Math.abs(z) <= HALF && Math.abs(x) <= SPAN ? deckY(x) : Math.abs(x) < 4.6 ? RIVER_Y : Math.max(RIVER_Y, T.heightAt(x, z)));
    group.updateMatrixWorld(true);   // nested props (marker post, signpost) must have world matrices before any render
    return {
      group, heightAt, colliders,
      update(t, t2, c) { river.material.uniforms.uTime.value = t2; cs.update(c, heightAt); },
      dispose() {},
    };
  },
};
