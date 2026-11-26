// World A (land) 3D kit: terrain with an exact heightAt, trail marker posts, flax, crown ferns, instanced grass tufts
// and pebbles, rocks, contact shadow. All cel-shaded through ctx.celMaterial (patched variants for tints/sway).
import { rng, hash, noise2, fbm2, clamp, lerp } from "../../core/time.js";

/**
 * Cel material variant. x.tint: multiply by attribute aTint (per vertex or per instance). x.discard: alpha cut-out.
 * x.sway: world-space wind sway (uniforms uTime, uWind (xyz), uSwayH: height scale), x.world: pass world pos varying.
 */
export function celX(ctx, o = {}, x = {}) {
  const m = ctx.celMaterial(o);
  let v = m.vertexShader, f = m.fragmentShader;
  if (x.tint) {
    v = v.replace("#include <common>", "#include <common>\nattribute vec3 aTint; varying vec3 vTint;").replace("vUv0 = uv;", "vUv0 = uv; vTint = aTint;");
    f = f.replace("varying vec3 vNv;", "varying vec3 vTint; varying vec3 vNv;").replace("vec3 base = uColor * tex.rgb;", "vec3 base = uColor * tex.rgb * vTint;");
  }
  if (x.iTint) v = v.replace("attribute vec3 aTint;", "attribute vec3 aTint; attribute vec3 aITint;").replace("vTint = aTint;", "vTint = aTint * aITint;");
  if (x.discard) f = f.replace("vec3 base = uColor", `if (tex.a < ${x.discard.toFixed(3)}) discard;\n  vec3 base = uColor`);
  if (x.sway) {
    m.uniforms.uTime = { value: 0 }; m.uniforms.uWind = { value: new ctx.THREE.Vector3(...(x.sway.wind ?? [0.1, 0, 0.03])) };
    m.uniforms.uSwayH = { value: x.sway.h ?? 1 }; m.uniforms.uGust = { value: 0 };
    v = v.replace("#include <common>", "#include <common>\nuniform float uTime; uniform vec3 uWind; uniform float uSwayH; uniform float uGust;")
      .replace("#include <project_vertex>", `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  vec4 wpos = modelMatrix * mvPosition;
  float hk = max(transformed.y, 0.0) / uSwayH;
  #ifdef USE_INSTANCING
    hk *= length(instanceMatrix[1].xyz);
    float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
  #else
    float ph = wpos.x * 1.3 + wpos.z * 0.7;
  #endif
  float osc = 0.65 + 0.35 * sin(uTime * 2.1 + ph) + 0.2 * sin(uTime * 5.3 + ph * 2.0) + uGust;
  wpos.xz += uWind.xz * hk * hk * osc;
  wpos.y -= length(uWind.xz) * hk * hk * hk * 0.35 * abs(osc);
  mvPosition = viewMatrix * wpos;
  gl_Position = projectionMatrix * mvPosition;`);
  }
  if (x.world) {
    v = v.replace("#include <common>", "#include <common>\nvarying vec3 vWp;").replace("vPv = mvPosition.xyz;", "vPv = mvPosition.xyz; vWp = (inverse(viewMatrix) * vec4(mvPosition.xyz, 1.0)).xyz;");
    f = f.replace("varying vec3 vNv;", "varying vec3 vWp; varying vec3 vNv;");
    if (x.world.frag) f = f.replace("col += uEmissive;", x.world.frag + "\n  col += uEmissive;");
    if (x.world.pars) f = f.replace("varying vec3 vWp;", "varying vec3 vWp;\n" + x.world.pars);
  }
  m.vertexShader = v; m.fragmentShader = f;
  return m;
}

/**
 * Height-field terrain on a regular grid. h(x, z) gives vertex heights; heightAt interpolates the very triangles
 * (diagonal b-c), so feet planted with heightAt sit exactly on the mesh. keep(h00,h10,h01,h11,x,z) can drop cells.
 */
export function terrain(ctx, { x0, x1, z0, z1, nx, nz, h, keep, material, uv }) {
  const { THREE } = ctx;
  const W = nx + 1, H = new Float32Array(W * (nz + 1));
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) H[i * W + j] = h(x0 + j * dx, z0 + i * dz);
  const pos = new Float32Array(W * (nz + 1) * 3), uvs = new Float32Array(W * (nz + 1) * 2);
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) {
    const k = i * W + j, x = x0 + j * dx, z = z0 + i * dz; pos.set([x, H[k], z], k * 3);
    const u = uv ? uv(x, z) : [(x - x0) / (x1 - x0), (z - z0) / (z1 - z0)]; uvs.set(u, k * 2);
  }
  const idx = [];
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    if (keep && !keep(H[a], H[b], H[c], H[d], x0 + (j + 0.5) * dx, z0 + (i + 0.5) * dz)) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material); mesh.name = "ground";
  const heightAt = (x, z) => {
    const fx = (x - x0) / dx, fz = (z - z0) / dz;
    const j = clamp(Math.floor(fx), 0, nx - 1), i = clamp(Math.floor(fz), 0, nz - 1);
    const u = clamp(fx - j, 0, 1), w = clamp(fz - i, 0, 1);
    const a = H[i * W + j], b = H[i * W + j + 1], c = H[(i + 1) * W + j], d = H[(i + 1) * W + j + 1];
    return u + w <= 1 ? a + (b - a) * u + (c - a) * w : d + (c - d) * (1 - u) + (b - d) * (1 - w);
  };
  return { mesh, heightAt, H };
}

/**
 * Ink-pass-only copy of a mesh (layer INK only): hides the buried parts of inked props from the ink pass and gives
 * an ink line where they meet it / where it meets the sky. Optional geometry filter keeps only some triangles.
 */
export function inkOccluder(ctx, mesh, keepTri) {
  let geo = mesh.geometry;
  if (keepTri) {
    const idx = geo.index.array, p = geo.getAttribute("position"), out = [];
    for (let i = 0; i < idx.length; i += 3) if (keepTri(p.getY(idx[i]), p.getY(idx[i + 1]), p.getY(idx[i + 2]))) out.push(idx[i], idx[i + 1], idx[i + 2]);
    geo = geo.clone(); geo.setIndex(out);
  }
  const o = new ctx.THREE.Mesh(geo, mesh.material); o.layers.set(ctx.INK); o.name = (mesh.name || "mesh") + "-ink";
  return o;
}

/** Te Araroa marker post: wooden pole with orange tip and an orange triangle on its face. */
export function markerPost(ctx, x, z, { y = 0, yaw = -20, h = 1.1, lean = 0, seed = 1 } = {}) {
  const { THREE, PALETTE, inkable } = ctx;
  const grp = new THREE.Group(); grp.name = "marker-post";
  const wood = ctx.celMaterial({ color: "#8B6B4E", shade: 0.8 });
  const tipH = 0.12;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, h - tipH, 7), wood); pole.position.y = (h - tipH) / 2; pole.name = "post";
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, tipH, 7), ctx.celMaterial({ color: PALETTE.marker })); tip.position.y = h - tipH / 2; tip.name = "post-tip";
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.031, 0.025, 7), ctx.celMaterial({ color: PALETTE.marker })); cap.position.y = h + 0.012; cap.name = "post-cap";
  const s = 0.13, shape = new THREE.Shape();
  shape.moveTo(0, s * 0.58); shape.lineTo(-s / 2, -s * 0.29); shape.lineTo(s / 2, -s * 0.29); shape.closePath();
  const triGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false }); triGeo.translate(0, 0, 0.031);
  const triMat = ctx.celMaterial({ color: PALETTE.marker, hi: 0.3, rim: 0.6 });
  const tri = new THREE.Mesh(triGeo, triMat); tri.position.y = h - 0.27; tri.name = "marker";
  // two nails
  for (const ny of [0.03, -0.015]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), ctx.celMaterial({ color: "#C9C2B0" })); n.position.set(0, h - 0.27 + ny, 0.039); grp.add(n); }
  grp.add(pole, tip, cap, tri);
  // glow card (additive), off by default
  const gc = document.createElement("canvas"); gc.width = gc.height = 128; const gg = gc.getContext("2d");
  const gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,80,12,0.28)"); gr.addColorStop(0.22, "rgba(255,80,12,0.34)"); gr.addColorStop(0.5, "rgba(255,70,8,0.16)"); gr.addColorStop(1, "rgba(255,60,0,0)");
  gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
  const gtex = new THREE.CanvasTexture(gc);
  const glowMat = new THREE.MeshBasicMaterial({ map: gtex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), glowMat); glow.name = "marker-glow"; glow.renderOrder = 5;
  grp.add(glow);
  grp.position.set(x, y, z); grp.rotation.y = THREE.MathUtils.degToRad(yaw); grp.rotation.z = lean;
  inkable(pole); inkable(tip); inkable(cap); inkable(tri);
  for (const m of [pole, tip, cap, tri]) m.userData.closed = true;
  const triWorld = () => tri.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0));
  return {
    group: grp, tri, triMat, glow, colliders: [pole, tip, cap, tri],
    /** lit 0..1+ : emissive ramp + glow card facing the camera */
    setLit(k, camera) {
      k = Math.max(0, k);
      triMat.uniforms.uEmissive.value.setRGB(0.62, 0.17, 0.015).multiplyScalar(0.12 + Math.min(k, 1.25) * 0.68);
      glowMat.opacity = clamp(k * 0.55, 0, 0.7);
      const p = triWorld(); glow.position.copy(grp.worldToLocal(p.clone()));
      glow.position.z += 0.05; glow.scale.setScalar(0.7 + Math.min(k, 1.6) * 0.5);
      if (camera) { const q = new THREE.Quaternion(); grp.getWorldQuaternion(q); glow.quaternion.copy(q.invert().multiply(camera.quaternion)); }
    },
  };
}

/** Build a ribbon leaf strip into arrays. pts: centre line [[x,y,z]], wid(s), side vector fn, fold depth, tint fn. */
function ribbon(out, pts, wid, sideAt, fold, tintAt) {
  const n = pts.length; const base = out.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const p = pts[i], s = i / (n - 1), w = wid(s), sd = sideAt(i);
    const t = i < n - 1 ? [pts[i + 1][0] - p[0], pts[i + 1][1] - p[1], pts[i + 1][2] - p[2]] : [p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]];
    // fold normal = t x side
    let nx = t[1] * sd[2] - t[2] * sd[1], ny = t[2] * sd[0] - t[0] * sd[2], nz = t[0] * sd[1] - t[1] * sd[0];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const c = tintAt(s);
    out.pos.push(p[0] - sd[0] * w / 2, p[1] - sd[1] * w / 2, p[2] - sd[2] * w / 2);
    out.pos.push(p[0] + nx * w * fold, p[1] + ny * w * fold, p[2] + nz * w * fold);
    out.pos.push(p[0] + sd[0] * w / 2, p[1] + sd[1] * w / 2, p[2] + sd[2] * w / 2);
    for (let k = 0; k < 3; k++) out.tint.push(c[0] * (k === 1 ? 1.08 : 1), c[1] * (k === 1 ? 1.08 : 1), c[2] * (k === 1 ? 1.05 : 1));
  }
  for (let i = 0; i < n - 1; i++) {
    const a = base + i * 3, b = a + 3;
    out.idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
}
function geoFrom(ctx, out) {
  const { THREE } = ctx; const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute("aTint", new THREE.Float32BufferAttribute(out.tint, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(out.pos.length / 3 * 2), 2));
  g.setIndex(out.idx); g.computeVertexNormals(); return g;
}
const col3 = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

/** NZ flax (harakeke) clump: sword leaves with a V crease, arching out, a few drooping/split tips. */
export function flax(ctx, { x, z, y = 0, seed = 1, n = 18, len = [0.9, 1.6], width = [0.05, 0.08], colors = ["#4E6A34", "#5D7A3A", "#3E5A2E"], tipColor = "#8A9A52", baseColor = "#3A3524", sway } = {}) {
  const { THREE } = ctx; const r = rng(seed); const out = { pos: [], tint: [], idx: [] };
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3), dirx = Math.sin(yaw), dirz = Math.cos(yaw);
    const L = r.range(...len) * (0.75 + 0.25 * Math.abs(Math.cos(i * 1.7))), w0 = r.range(...width);
    const el0 = r.range(1.05, 1.45), bend = r.range(0.5, 1.4), bx = x + dirx * r.range(0.02, 0.1), bz = z + dirz * r.range(0.02, 0.1);
    const pts = []; let px = bx, py = y - 0.02, pz = bz; const seg = 14;
    for (let k = 0; k <= seg; k++) {
      const s = k / seg; pts.push([px, py, pz]);
      const a = el0 - bend * Math.pow(s, 1.6); const ds = L / seg;
      px += Math.cos(a) * dirx * ds; pz += Math.cos(a) * dirz * ds; py += Math.sin(a) * ds;
    }
    const side = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const c0 = col3(r.pick(colors)), ct = col3(tipColor), cb = col3(baseColor);
    ribbon(out, pts, (s) => w0 * (s < 0.08 ? 0.6 + s * 5 : 1) * Math.pow(1 - s, 0.55), () => side, 0.28,
      (s) => s < 0.15 ? c0.map((v, j) => lerp(cb[j], v, s / 0.15)) : c0.map((v, j) => lerp(v, ct[j], Math.max(0, s - 0.6) * 1.2)));
  }
  const mat = celX(ctx, { color: "#ffffff", side: THREE.DoubleSide, thresh: 0.1, rim: 0.8 }, { tint: true, sway });
  const mesh = new THREE.Mesh(geoFrom(ctx, out), mat); mesh.name = "flax";
  return mesh;
}

/** Crown fern / ground fern: arching fronds of pinnae radiating from a crown. */
export function fern(ctx, { x, z, y = 0, seed = 1, n = 12, len = [0.45, 0.8], colors = ["#3F6B34", "#4F7D3C", "#355C2E"], tip = "#7FA84E", spread = 1, pinna = 0.09, upright = 1, sway } = {}) {
  const { THREE } = ctx; const r = rng(seed); const out = { pos: [], tint: [], idx: [] };
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 * spread + r.range(-0.35, 0.35), dx = Math.sin(yaw), dz = Math.cos(yaw);
    const L = r.range(...len), el0 = r.range(0.9, 1.3) * upright, bend = r.range(1.2, 2.0);
    const pts = []; let px = x + dx * 0.03, py = y + 0.02, pz = z + dz * 0.03; const seg = 30;
    for (let k = 0; k <= seg; k++) { pts.push([px, py, pz]); const s = k / seg, a = el0 - bend * Math.pow(s, 1.3), ds = L / seg; px += Math.cos(a) * dx * ds; pz += Math.cos(a) * dz * ds; py += Math.sin(a) * ds; }
    const side = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const c0 = col3(r.pick(colors)), ct = col3(tip);
    // rachis (thin ribbon)
    ribbon(out, pts, () => 0.006, () => side, 0.2, () => c0.map((v) => v * 0.7));
    // pinnae on both sides
    for (let k = 2; k < seg; k++) {
      const s = k / seg, env = Math.sin(Math.PI * Math.pow(s, 0.8)) * pinna * L / 0.6 * 0.85;
      if (env < 0.008) continue;
      const p = pts[k], q = pts[k + 1];
      const t = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]; const tl = Math.hypot(...t); t[0] /= tl; t[1] /= tl; t[2] /= tl;
      for (const sg of [-1, 1]) {
        const ang = 0.35; // swept forward
        const dir = [side[0] * sg * Math.cos(ang) + t[0] * Math.sin(ang), side[1] * sg * Math.cos(ang) + t[1] * Math.sin(ang) - 0.25, side[2] * sg * Math.cos(ang) + t[2] * Math.sin(ang)];
        const dl = Math.hypot(...dir); dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
        const pp = []; for (let m = 0; m <= 3; m++) { const u = m / 3; pp.push([p[0] + dir[0] * env * u, p[1] + dir[1] * env * u - u * u * env * 0.25, p[2] + dir[2] * env * u]); }
        const c = c0.map((v, j) => lerp(v, ct[j], Math.max(0, s - 0.5) * 1.4) * (0.9 + 0.2 * r()));
        ribbon(out, pp, (u) => 0.013 * L / 0.6 * Math.sin(Math.PI * (0.15 + u * 0.85)) + 0.002, () => t, 0.15, () => c);
      }
    }
  }
  const mat = celX(ctx, { color: "#ffffff", side: THREE.DoubleSide, thresh: 0.0, rim: 0.7 }, { tint: true, sway });
  const mesh = new THREE.Mesh(geoFrom(ctx, out), mat); mesh.name = "fern";
  return mesh;
}

/** A tuft of grass blades (unit size ~1 tall), base geometry for instancing. */
export function tuftGeo(ctx, { blades = 9, seed = 3, lean = 0.5, base = "#4A5A2A", tip = "#B8B070", width = 0.08, curl = 1 } = {}) {
  const r = rng(seed); const out = { pos: [], tint: [], idx: [] }; const cb = col3(base), ct = col3(tip);
  for (let i = 0; i < blades; i++) {
    const yaw = r.range(0, Math.PI * 2), dx = Math.sin(yaw), dz = Math.cos(yaw), L = r.range(0.6, 1.0), el0 = r.range(1.25, 1.5), b = r.range(0.3, 0.9) * lean * curl;
    const pts = []; let px = dx * 0.06 * r(), py = 0, pz = dz * 0.06 * r();
    for (let k = 0; k <= 5; k++) { pts.push([px, py, pz]); const a = el0 - b * (k / 5) ** 1.5, ds = L / 5; px += Math.cos(a) * dx * ds; pz += Math.cos(a) * dz * ds; py += Math.sin(a) * ds; }
    const side = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const v = r.range(0.85, 1.12);
    ribbon(out, pts, (s) => width * (1 - s * 0.92), () => side, 0.1, (s) => cb.map((c, j) => lerp(c, ct[j], Math.pow(s, 0.8)) * v));
  }
  const g = geoFrom(ctx, out); upNormals(g, 0.75); return g;
}
/** Blend vertex normals toward +Y (grass/fronds lit like the ground they grow from). */
export function upNormals(g, k) {
  const n = g.getAttribute("normal");
  for (let i = 0; i < n.count; i++) { let x = n.getX(i) * (1 - k), y = Math.abs(n.getY(i)) * (1 - k) + k, z = n.getZ(i) * (1 - k); const l = Math.hypot(x, y, z) || 1; n.setXYZ(i, x / l, y / l, z / l); }
  n.needsUpdate = true;
}

/** Instance a geometry at points [{x,z,s,yaw,y?}] with a tinted cel material. */
export function instanced(ctx, geo, pts, { heightAt, color = "#ffffff", sink = 0, name = "inst", sway, rim = 0.7, thresh = 0.05, side, matOpts = {} } = {}) {
  const { THREE } = ctx;
  if (!geo.getAttribute("aTint")) geo.setAttribute("aTint", new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count * 3).fill(1), 3));
  const it = new Float32Array(Math.max(1, pts.length) * 3).fill(1); pts.forEach((p, i) => { if (p.c) it.set(p.c, i * 3); });
  geo = geo.clone(); geo.setAttribute("aITint", new THREE.InstancedBufferAttribute(it, 3));
  const mat = celX(ctx, { color, side: side ?? THREE.DoubleSide, rim, thresh, ...matOpts }, { tint: true, iTint: true, sway });
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length)); im.name = name; im.count = pts.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  pts.forEach((p, i) => {
    const s0 = Array.isArray(p.s) ? p.s[1] : (p.sy ?? p.s ?? 1);
    const y = (p.y ?? (heightAt ? heightAt(p.x, p.z) : 0)) - sink * s0;
    e.set(p.rx ?? 0, p.yaw ?? 0, p.rz ?? 0); q.setFromEuler(e);
    const sc = Array.isArray(p.s) ? new THREE.Vector3(...p.s) : new THREE.Vector3(p.s ?? 1, p.sy ?? p.s ?? 1, p.s ?? 1);
    m.compose(new THREE.Vector3(p.x, y, p.z), q, sc); im.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
  return im;
}

/** Low-poly rock geometry (unit radius), jittered icosahedron, flattened bottom. */
export function rockGeo(ctx, { seed = 1, detail = 1, flat = 0.6, jag = 0.22 } = {}) {
  const { THREE } = ctx; const g = new THREE.IcosahedronGeometry(1, detail); const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50), seed) - 0.5) * jag * 2 + noise2(x * 1.3 + seed, z * 1.3 + y, seed) * jag;
    p.setXYZ(i, x * k, Math.max(y * k * flat, -0.15), z * k);
  }
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); g.dispose();
  return ng;
}

/** Soft dark contact shadow that follows the kiwi on the ground. */
export function contactShadow(ctx, { size = [0.42, 0.34], a = 0.45, color = "#1a1420" } = {}) {
  const { THREE } = ctx;
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,0.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ color, alphaMap: tex, transparent: true, opacity: a, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat); mesh.name = "contact-shadow"; mesh.renderOrder = 2;
  mesh.scale.set(size[0], 1, size[1]);
  return {
    mesh,
    update(ctx2, heightAt) {
      const k = ctx2.kiwi; if (!k?.anchor) { mesh.visible = true; return; }
      const p = k.anchor("root"); const y = heightAt(p.x, p.z);
      mesh.position.set(p.x, y + 0.004, p.z);
    },
  };
}

/** Scatter points with rejection: area fn(r) -> {x,z} or null. */
export function scatter(n, seed, fn) {
  const r = rng(seed); const out = [];
  for (let i = 0; i < n * 6 && out.length < n; i++) { const p = fn(r, i); if (p) out.push(p); }
  return out;
}
