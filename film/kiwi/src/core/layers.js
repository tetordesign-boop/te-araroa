// Painted background layers (multiplane). Each layer is a vertical plane at a set distance in front of the shot's
// cameras, sized to cover every frame of the shot in both aspects. Painters draw on a canvas mapped to world space.
// The brush pass (generalised Kuwahara + paper grain) runs ONCE per layer when the shot is built: the painted
// look costs nothing per frame.
import * as THREE from "three";
import { RIG_U } from "./cel.js";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Work out the plane for a layer at `depth` metres from the shots' mean camera, facing it horizontally.
 * cams: array of {pos: Vector3, quat: Quaternion, fov (vertical deg), aspect}. Returns the mapping L.
 */
export function cover(cams, depth, { margin = 0.1, outH = 1080, maxPx = 4096, quality = 1 } = {}) {
  const C = new THREE.Vector3(), F = new THREE.Vector3();
  for (const c of cams) { C.add(c.pos); F.add(new THREE.Vector3(0, 0, -1).applyQuaternion(c.quat)); }
  C.divideScalar(cams.length); F.y = 0; if (F.lengthSq() < 1e-6) F.set(0, 0, -1); F.normalize();
  const R = new THREE.Vector3().crossVectors(F, UP).normalize();
  const P0 = C.clone().addScaledVector(F, depth);           // a point on the plane
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(F.clone().negate(), P0);
  let s0 = Infinity, s1 = -Infinity, y0 = Infinity, y1 = -Infinity; const ray = new THREE.Ray(), hit = new THREE.Vector3();
  let fovMin = 180;
  for (const c of cams) {
    fovMin = Math.min(fovMin, c.fov);
    const th = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * (1 + margin), tw = th * c.aspect;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1], [-1, 0], [1, 0]]) {
      const d = new THREE.Vector3(sx * tw, sy * th, -1).normalize().applyQuaternion(c.quat);
      ray.set(c.pos, d);
      if (!ray.intersectPlane(plane, hit) || hit.distanceTo(c.pos) > depth * 12) hit.copy(c.pos).addScaledVector(d, depth * 12);
      const s = hit.dot(R); s0 = Math.min(s0, s); s1 = Math.max(s1, s); y0 = Math.min(y0, hit.y); y1 = Math.max(y1, hit.y);
    }
  }
  const padS = (s1 - s0) * 0.04, padY = (y1 - y0) * 0.04; s0 -= padS; s1 += padS; y0 -= padY; y1 += padY;
  // pixels per metre so the layer is ~1:1 with the output at this depth
  const frameH = 2 * depth * Math.tan(THREE.MathUtils.degToRad(fovMin) / 2);
  let ppm = (outH / frameH) * quality;
  let w = (s1 - s0) * ppm, h = (y1 - y0) * ppm;
  const k = Math.min(1, maxPx / w, maxPx / h); ppm *= k; w = Math.max(16, Math.round(w * k)); h = Math.max(16, Math.round(h * k));
  const centerS = (s0 + s1) / 2, centerY = (y0 + y1) / 2;
  const origin = P0.clone().addScaledVector(R, centerS - P0.dot(R)); origin.y = centerY;
  const L = {
    w, h, depth, s0, s1, y0, y1, ppm, R, F, origin, cam: C.clone(),
    /** world (s along R, height y) -> canvas px */
    px: (s, y) => [(s - s0) * ppm, (y1 - y) * ppm],
    sx: (s) => (s - s0) * ppm, yy: (y) => (y1 - y) * ppm,
    /** canvas px -> world */
    s: (px) => s0 + px / ppm, y: (py) => y1 - py / ppm,
    /** direction seen from the mean camera: azimuth (deg, + = right) and elevation (deg, + = up) -> canvas px */
    ang: (az, el) => {
      const dist = depth; const s = C.dot(R) + Math.tan(THREE.MathUtils.degToRad(az)) * dist;
      const y = C.y + Math.tan(THREE.MathUtils.degToRad(el)) * dist; return [(s - s0) * ppm, (y1 - y) * ppm];
    },
    /** canvas y of the true horizon (eye level of the mean camera) */
    horizon: (y1 - C.y) * ppm,
  };
  return L;
}

const quadVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const kuwaFrag = /* glsl */ `
precision highp float; uniform sampler2D tSrc; uniform vec2 uPx; uniform int uR; uniform float uPaper; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec4 m[4]; vec3 s[4];
  for (int k=0;k<4;k++){ m[k]=vec4(0.); s[k]=vec3(0.); }
  for (int j=-uR;j<=uR;j++) for (int i=-uR;i<=uR;i++) {
    vec4 c = texture2D(tSrc, vUv + vec2(float(i), float(j)) * uPx);
    vec3 c2 = c.rgb*c.rgb;
    if (i<=0 && j<=0) { m[0]+=c; s[0]+=c2; }
    if (i>=0 && j<=0) { m[1]+=c; s[1]+=c2; }
    if (i<=0 && j>=0) { m[2]+=c; s[2]+=c2; }
    if (i>=0 && j>=0) { m[3]+=c; s[3]+=c2; }
  }
  float n = float((uR+1)*(uR+1)); float best = 1e9; vec4 outc = vec4(0.);
  for (int k=0;k<4;k++){ vec4 mu = m[k]/n; vec3 v = abs(s[k]/n - mu.rgb*mu.rgb); float sg = v.r+v.g+v.b; if (sg < best) { best = sg; outc = mu; } }
  // paper: soft granulation + fibre, stronger in mid tones
  vec2 p = vUv / uPx;
  float g = (vn(p*0.35)-0.5)*0.6 + (vn(p*1.7)-0.5)*0.4 + (h(p)-0.5)*0.25;
  float lum = dot(outc.rgb, vec3(0.299,0.587,0.114));
  outc.rgb *= 1.0 + g * uPaper * (0.6 + 0.8*lum*(1.0-lum)*4.0);
  gl_FragColor = outc;
}`;

let bakeScene, bakeCam, bakeMat;
/**
 * Brush pass: canvas -> painted texture (Kuwahara radius r px, paper grain amount). Returns a THREE.Texture backed by a
 * render target (kept on the GPU).
 */
export function brushify(renderer, canvas, { r = 3, paper = 0.06, mips = true } = {}) {
  const src = new THREE.CanvasTexture(canvas); src.colorSpace = THREE.NoColorSpace; src.minFilter = THREE.LinearFilter; src.generateMipmaps = false;
  if (r <= 0 && paper <= 0) { src.generateMipmaps = mips; src.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; return { texture: src, dispose: () => src.dispose() }; }
  if (!bakeScene) {
    bakeMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uR: { value: 3 }, uPaper: { value: 0.06 } }, vertexShader: quadVert, fragmentShader: kuwaFrag, depthTest: false, depthWrite: false });
    bakeScene = new THREE.Scene(); bakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat)); bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  const rt = new THREE.WebGLRenderTarget(canvas.width, canvas.height, { depthBuffer: false, generateMipmaps: mips, minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter });
  bakeMat.uniforms.tSrc.value = src; bakeMat.uniforms.uPx.value.set(1 / canvas.width, 1 / canvas.height);
  bakeMat.uniforms.uR.value = Math.min(8, Math.round(r)); bakeMat.uniforms.uPaper.value = paper;
  const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(bakeScene, bakeCam); renderer.setRenderTarget(prev);
  src.dispose();
  return { texture: rt.texture, dispose: () => rt.dispose() };
}

const layerVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const layerFrag = /* glsl */ `
uniform sampler2D tMap; uniform float uOpacity; uniform vec3 uTint; uniform float uFlash; uniform vec3 uFlashColor; uniform float uFlashMul;
uniform vec2 uScroll; varying vec2 vUv;
void main(){ vec4 c = texture2D(tMap, vUv + uScroll); c.rgb *= uTint; c.rgb = mix(c.rgb, uFlashColor, uFlash*uFlashMul*c.a);
  gl_FragColor = vec4(c.rgb, c.a*uOpacity); }`;

/** Build the plane mesh for a baked layer. layer.mesh.material.uniforms: uOpacity, uTint, uScroll, uFlashMul. */
export function layerMesh(L, texture, { flash = 0.5, renderOrder } = {}) {
  const geo = new THREE.PlaneGeometry(L.w / L.ppm, L.h / L.ppm);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: texture }, uOpacity: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uScroll: { value: new THREE.Vector2() }, uFlash: RIG_U.uFlash, uFlashColor: RIG_U.uFlashColor, uFlashMul: { value: flash } },
    vertexShader: layerVert, fragmentShader: layerFrag, transparent: true, depthWrite: false, depthTest: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(L.origin);
  m.lookAt(L.origin.clone().sub(L.F));            // face the camera side
  m.renderOrder = renderOrder ?? -Math.round(L.depth);
  m.frustumCulled = false;
  return m;
}
