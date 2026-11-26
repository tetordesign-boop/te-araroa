// Cel (toon) shading shared by every 3D thing in the film, lit by the shot's rig. Supports skinning, morphs and
// instancing through three's shader chunks, so the kiwi (SkinnedMesh), props and instanced rocks all match.
import * as THREE from "three";

/** Shared rig uniforms: the stage updates these once per frame; every cel material references the same objects. */
export const RIG_U = {
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) },     // view space, towards the light
  uKeyColor: { value: new THREE.Color("#ffffff") },
  uShade: { value: new THREE.Color("#555577") },
  uRimDir: { value: new THREE.Vector3(0, 0, -1) },    // view space, towards the rim light
  uRimColor: { value: new THREE.Color("#ffffff") },
  uRimPower: { value: 0.8 },
  uAmbient: { value: 0.12 },
  uBandSoft: { value: 0.04 },
  uFogColor: { value: new THREE.Color("#888888") },
  uFogNear: { value: 50 },
  uFogFar: { value: 1000 },
  uFlash: { value: 0 },                               // lightning: 0..1 flattens everything toward the flash colour
  uFlashColor: { value: new THREE.Color("#EAF2FF") },
};

const vert = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vNv; varying vec3 vNw; varying vec3 vPv; varying vec2 vUv0;
void main() {
  vUv0 = uv;
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vNv = normalize(transformedNormal);
  vNw = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
  vPv = mvPosition.xyz;
}`;

const frag = /* glsl */ `
uniform vec3 uColor; uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uEmissive; uniform float uOpacity;
uniform float uThresh; uniform float uHi; uniform float uRimMul; uniform float uFogMul; uniform float uShadeMul;
uniform vec3 uKeyDir; uniform vec3 uKeyColor; uniform vec3 uShade; uniform vec3 uRimDir; uniform vec3 uRimColor;
uniform float uRimPower; uniform float uAmbient; uniform float uBandSoft;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uFlash; uniform vec3 uFlashColor;
varying vec3 vNv; varying vec3 vNw; varying vec3 vPv; varying vec2 vUv0;
void main() {
  vec4 tex = uHasMap > 0.5 ? texture2D(uMap, vUv0) : vec4(1.0);
  vec3 base = uColor * tex.rgb;
  vec3 n = normalize(vNv); if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-vPv);
  float ndl = dot(n, normalize(uKeyDir));
  float lit = smoothstep(uThresh - uBandSoft, uThresh + uBandSoft, ndl);
  float hi = smoothstep(0.82 - uBandSoft, 0.82 + uBandSoft, dot(n, normalize(normalize(uKeyDir) + v))) * uHi;
  vec3 shadeCol = base * mix(vec3(1.0), uShade * 1.6, uShadeMul) * (0.55 + uAmbient);
  vec3 litCol = base * uKeyColor;
  vec3 col = mix(shadeCol, litCol, lit) + uKeyColor * hi * 0.25;
  float fres = 1.0 - max(dot(n, v), 0.0);
  float rimSide = smoothstep(-0.2, 0.4, dot(n, normalize(uRimDir)));
  float rim = smoothstep(0.62, 0.68, fres) * rimSide;
  col = mix(col, uRimColor * max(base * 1.6, vec3(0.35)), rim * uRimPower * uRimMul);
  col += uEmissive;
  float fog = smoothstep(uFogNear, uFogFar, length(vPv)) * uFogMul;
  col = mix(col, uFogColor, fog);
  col = mix(col, uFlashColor, uFlash * 0.85);
  gl_FragColor = vec4(col, uOpacity * tex.a);
}`;

/**
 * Cel material. opts: color, map, emissive, opacity, thresh (where light turns to shadow, -1..1, default 0.05),
 * hi (specular band 0..1), rim (rim multiplier), fog (fog multiplier, 0 to ignore fog), shade (0..1 how strongly the
 * rig's shade colour tints shadows), transparent, side.
 */
export function celMaterial(opts = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...RIG_U,
      uColor: { value: new THREE.Color(opts.color ?? "#ffffff") },
      uMap: { value: opts.map ?? null }, uHasMap: { value: opts.map ? 1 : 0 },
      uEmissive: { value: new THREE.Color(opts.emissive ?? "#000000") },
      uOpacity: { value: opts.opacity ?? 1 },
      uThresh: { value: opts.thresh ?? 0.05 }, uHi: { value: opts.hi ?? 0 },
      uRimMul: { value: opts.rim ?? 1 }, uFogMul: { value: opts.fog ?? 1 }, uShadeMul: { value: opts.shade ?? 1 },
    },
    vertexShader: vert, fragmentShader: frag,
    transparent: !!opts.transparent || (opts.opacity ?? 1) < 1, side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
  m.userData.cel = true;
  return m;
}

const outlineVert = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform float uWidth;
void main() {
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  // push along the view-space normal by a width that stays roughly constant on screen
  vec3 nv = normalize(normalMatrix * objectNormal);
  float w = uWidth * max(-mvPosition.z, 0.05);
  mvPosition.xyz += nv * w;
  gl_Position = projectionMatrix * mvPosition;
}`;

/** Inverted-hull outline: add as a sibling mesh sharing the geometry (and skeleton). width ≈ screen fraction (0.004). */
export function outlineMaterial(width = 0.0035, color = "#0A0D16") {
  const m = new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: width }, uInk: { value: new THREE.Color(color) } },
    vertexShader: outlineVert,
    fragmentShader: `uniform vec3 uInk; void main(){ gl_FragColor = vec4(uInk, 1.0); }`,
    side: THREE.BackSide,
  });
  m.userData.outline = true;
  return m;
}

/** Layers: 0 = colour pass (everything), 1 = INK pass (solid 3D things whose edges get ink lines). */
export const INK = 1;
/** Make an object (and children) cast ink lines. Outline hulls must NOT be on the INK layer. */
export function inkable(obj, on = true) {
  obj.traverse((o) => { if (o.isMesh && !o.material?.userData?.outline) { on ? o.layers.enable(INK) : o.layers.disable(INK); } });
  return obj;
}
