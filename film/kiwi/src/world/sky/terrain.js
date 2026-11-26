// World B 3D kit: terrain grids whose heightAt matches the mesh triangles exactly, tileable painted textures (repeat
// wrapping), faceted cel rocks (merged, inkable, usable as colliders) and instanced tussock clumps that can bend.
import * as THREE from "three";
import { brushify } from "../../core/layers.js";
import { rng, clamp } from "../../core/time.js";

// ------------------------------------------------------------------ textures
const copyVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const copyFrag = `uniform sampler2D tSrc; uniform vec4 uRect; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, uRect.xy + vUv * uRect.zw); }`;
let copyScene, copyCam, copyMat;
/**
 * A painted texture that tiles: paint(g, w, h, wrap) draws on a (w+2m)x(h+2m) canvas already translated by m; call
 * wrap(x, y, reach, fn) to draw an element and its wrapped copies. After the brush pass the centre w*h is copied into
 * a RepeatWrapping, mipmapped render target. Returns {texture, dispose}.
 */
export function tileTexture(ctx, w, h, paint, brush = { r: 2, paper: 0.05 }, { m = 24, aniso = 4 } = {}) {
  const c = document.createElement("canvas"); c.width = w + 2 * m; c.height = h + 2 * m;
  const g = c.getContext("2d"); g.translate(m, m);
  const wrap = (x, y, reach, fn) => {
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const X = x + ox, Y = y + oy; if (X < -m - reach || X > w + m + reach || Y < -m - reach || Y > h + m + reach) continue; fn(X, Y);
    }
  };
  paint(g, w, h, wrap);
  const b = brushify(ctx.renderer, c, { ...brush, mips: false });
  return copyRect(ctx.renderer, b, [m / c.width, m / c.height, w / c.width, h / c.height], w, h, { wrap: THREE.RepeatWrapping, aniso });
}
/** A painted (non-tiling) texture with mipmaps and clamp wrapping, like ctx.paintTexture but disposable. */
export function paintedTexture(ctx, w, h, paint, brush = { r: 2, paper: 0.05 }, { aniso = 4, wrap = THREE.ClampToEdgeWrapping } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d"), w, h);
  const b = brushify(ctx.renderer, c, { ...brush, mips: false });
  return copyRect(ctx.renderer, b, [0, 0, 1, 1], w, h, { wrap, aniso });
}
function copyRect(renderer, b, rect, w, h, { wrap, aniso }) {
  if (!copyScene) {
    copyMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uRect: { value: new THREE.Vector4() } }, vertexShader: copyVert, fragmentShader: copyFrag, depthTest: false, depthWrite: false });
    copyScene = new THREE.Scene(); copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat)); copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, wrapS: wrap, wrapT: wrap, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: aniso });
  copyMat.uniforms.tSrc.value = b.texture; copyMat.uniforms.uRect.value.set(...rect);
  const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(copyScene, copyCam); renderer.setRenderTarget(prev);
  b.dispose();
  rt.texture.userData.keep = true;
  return { texture: rt.texture, dispose: () => rt.dispose() };
}

// ------------------------------------------------------------------ terrain
/** Coordinates from a to b, dense (step0) near `c`, growing geometrically to stepMax. */
export function axis(a, b, c = 0, step0 = 0.05, grow = 1.08, stepMax = 2) {
  const left = [], right = [];
  let x = c, s = step0; while (x > a) { left.push(x); x -= s; s = Math.min(stepMax, s * grow); } left.push(a);
  x = c + step0; s = step0 * grow; while (x < b) { right.push(x); x += s; s = Math.min(stepMax, s * grow); } right.push(b);
  return [...left.reverse(), ...right].filter((v, i, arr) => i === 0 || v > arr[i - 1] + 1e-6);
}
/**
 * Terrain mesh over a rectilinear grid (xs, zs ascending) with height h(x,z). heightAt(x,z) interpolates the very same
 * triangles, so feet planted with it sit exactly on the mesh. uv = world xz / tile. Returns {mesh, heightAt}.
 */
export function gridTerrain(ctx, { xs, zs, h, material, tile = 1, name = "ground", skirt = 0 }) {
  const nx = xs.length, nz = zs.length, H = new Float32Array(nx * nz);
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, y = h(xs[i], zs[j]); H[k] = y;
    pos.set([xs[i], y, zs[j]], k * 3); uv.set([xs[i] / tile, -zs[j] / tile], k * 2);
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;   // a=(i,j) b=(i+1,j) c=(i,j+1) d=(i+1,j+1)
    idx.push(a, c, b, c, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material); mesh.name = name;
  const find = (arr, v) => { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; } return lo; };
  const heightAt = (x, z) => {
    if (x < xs[0] || x > xs[nx - 1] || z < zs[0] || z > zs[nz - 1]) return h(x, z);
    const i = find(xs, x), j = find(zs, z);
    const fx = (x - xs[i]) / (xs[i + 1] - xs[i]), fz = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const h00 = H[j * nx + i], h10 = H[j * nx + i + 1], h01 = H[(j + 1) * nx + i], h11 = H[(j + 1) * nx + i + 1];
    return fx + fz <= 1 ? h00 + fx * (h10 - h00) + fz * (h01 - h00) : h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
  };
  return { mesh, heightAt, H };
}

// ------------------------------------------------------------------ rocks
/** One irregular faceted rock geometry (non-indexed, flat normals), ~unit size, base near y=0. */
export function rockGeometry(seed = 1, { detail = 1, flat = 0.65, lump = 0.28, sharp = 0.5 } = {}) {
  const r = rng(seed);
  const geo = new THREE.IcosahedronGeometry(0.5, detail);
  const p = geo.attributes.position, v = new THREE.Vector3();
  // a few random cutting planes give chipped, angular facets
  const cuts = Array.from({ length: 5 }, () => { const n = new THREE.Vector3(r.gauss(), r.gauss() * 0.6 + 0.3, r.gauss()).normalize(); return [n, r.range(0.28, 0.42)]; });
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    if (!map.has(key)) {
      const w = v.clone().multiplyScalar(1 + lump * (r() - 0.5));
      for (const [n, d] of cuts) { const s = w.dot(n); if (s > d) w.addScaledVector(n, -(s - d) * sharp); }
      w.y *= flat; map.set(key, w);
    }
    const w = map.get(key); p.setXYZ(i, w.x, w.y, w.z);
  }
  geo.computeBoundingBox(); const minY = geo.boundingBox.min.y; geo.translate(0, -minY * 0.75, 0);
  const g2 = geo.index ? geo.toNonIndexed() : geo; g2.computeVertexNormals(); return g2;
}
/**
 * Merge many rocks into one mesh (one material): items = [{x, z, s, sy?, rot?, sink?}]. y from heightAt. Returns mesh.
 * userData.closed is left false (merged rocks are not one closed volume).
 */
export function mergedRocks(ctx, items, material, { seed = 1, variants = 6, heightAt = () => 0, name = "rocks", detail = 1, flat = 0.65 } = {}) {
  const geos = Array.from({ length: variants }, (_, i) => rockGeometry(seed * 31 + i, { detail, flat }));
  const r = rng(seed * 7 + 5), parts = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const it of items) {
    const g = geos[Math.floor(r() * variants)].clone();
    e.set(r.gauss() * 0.15, it.rot ?? r() * Math.PI * 2, r.gauss() * 0.15); q.setFromEuler(e);
    const y = it.y ?? heightAt(it.x, it.z) - (it.sink ?? 0.15) * it.s * (it.sy ?? 1);
    m.compose(new THREE.Vector3(it.x, y, it.z), q, new THREE.Vector3(it.s * (it.sx ?? 1), it.s * (it.sy ?? 1), it.s * (it.sz ?? 1)));
    g.applyMatrix4(m);
    // the ink pass does not see the (non-inkable) ground: flatten the buried part onto the surface so the outline
    // follows the visible silhouette only
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), gy = heightAt(x, z) - 0.002; if (pa.getY(i) < gy) pa.setY(i, gy); }
    g.computeVertexNormals(); parts.push(g);
  }
  const geo = mergeGeos(parts);
  const mesh = new THREE.Mesh(geo, material); mesh.name = name; return mesh;
}
export function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c; g.dispose();
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere(); return geo;
}

// ------------------------------------------------------------------ tussock
/** One tussock clump: a fountain of thin tapering blades (merged ribbons), unit height ~1, base at y=0. */
export function tussockGeometry(seed = 1, { blades = 46, spread = 0.55, droop = 0.55, width = 0.035, segs = 4 } = {}) {
  const r = rng(seed); const pos = [], nor = [], uv = [], idx = []; let base = 0;
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, lean = Math.pow(r(), 0.7) * spread, len = r.range(0.65, 1.1), wid = width * r.range(0.7, 1.3);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const root = dir.clone().multiplyScalar(r() * 0.08);
    const dr = droop * r.range(0.5, 1.2) * lean;
    for (let s = 0; s <= segs; s++) {
      const k = s / segs, out = lean * k * len + dr * k * k * len * 0.6, up = len * (k - dr * k * k * 0.55);
      const c = root.clone().addScaledVector(dir, out); c.y = Math.max(0, up);
      const w = wid * (1 - k * 0.92);
      const n = new THREE.Vector3(dir.x * 0.4, 1 - lean * k, dir.z * 0.4).normalize();   // soft upward-ish normals: reads as a mass
      for (const sg of [-1, 1]) { const p = c.clone().addScaledVector(side, sg * w * 0.5); pos.push(p.x, p.y, p.z); nor.push(n.x, n.y + 0.3, n.z); uv.push(sg < 0 ? 0 : 1, k); }
    }
    for (let s = 0; s < segs; s++) { const i = base + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    base += (segs + 1) * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeBoundingSphere(); return geo;
}
/**
 * Instanced clumps. items = [{x, z, s, rot?}]. Returns {mesh, items, pose(bend(item) -> [bx, bz])} where pose()
 * rewrites the instance matrices with a shear (blades lean by bx, bz per unit height).
 */
export function instancedClumps(geo, material, items, heightAt, { name = "tussock", sink = 0.01 } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, items.length); mesh.name = name; mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), sh = new THREE.Matrix4(), rot = new THREE.Matrix4(), sc = new THREE.Matrix4();
  for (const it of items) { it.y = heightAt(it.x, it.z) - sink * it.s; it.rot ??= 0; }
  const pose = (bend) => {
    items.forEach((it, i) => {
      const [bx, bz] = bend ? bend(it) : [0, 0];
      sh.set(1, bx, 0, 0, 0, 1, 0, 0, 0, bz, 1, 0, 0, 0, 0, 1);
      rot.makeRotationY(it.rot); sc.makeScale(it.s * (it.sx ?? 1), it.s * (it.sy ?? 1), it.s * (it.sx ?? 1));
      m.makeTranslation(it.x, it.y, it.z).multiply(sh).multiply(rot).multiply(sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  pose(null);
  return { mesh, items, pose };
}

/** Poisson-ish scatter: n candidates in [x0,x1]x[z0,z1] kept if keep(x,z,r) and min distance > dist(x,z). */
export function scatter(seed, n, [x0, x1, z0, z1], { keep = () => true, dist = () => 0.05, tries = 6 } = {}) {
  const r = rng(seed), pts = [];
  for (let i = 0; i < n * tries && pts.length < n; i++) {
    const x = r.range(x0, x1), z = r.range(z0, z1); if (!keep(x, z, r)) continue;
    const d = dist(x, z); if (pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < d * d)) continue;
    pts.push({ x, z, u: r(), v: r() });
  }
  return pts;
}
export { clamp };
