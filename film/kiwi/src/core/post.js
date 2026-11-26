// Per-frame passes: colour, ink (Sobel on depth + normals of the INK layer), bloom, then a composite that adds the
// lines, grade, paper grain, vignette, impact frames, speed lines, fades and the title overlay.
import * as THREE from "three";
import { INK } from "./cel.js";

const quadVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const brightFrag = /* glsl */ `uniform sampler2D tSrc; uniform float uThresh; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uThresh, uThresh + 0.25, l), 1.0); }`;
const blurFrag = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
  c += (texture2D(tSrc, vUv + uDir*1.3846).rgb + texture2D(tSrc, vUv - uDir*1.3846).rgb) * 0.3162;
  c += (texture2D(tSrc, vUv + uDir*3.2308).rgb + texture2D(tSrc, vUv - uDir*3.2308).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0); }`;

const compFrag = /* glsl */ `
precision highp float;
uniform sampler2D tColor; uniform sampler2D tNormal; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform sampler2D tTitle;
uniform vec2 uRes; uniform float uNear; uniform float uFar;
uniform vec3 uInk; uniform float uInkW; uniform float uInkAmt; uniform float uInkDepth; uniform float uInkNormal;
uniform vec3 uLift; uniform vec3 uGain; uniform float uSat; uniform float uContrast;
uniform float uBloom; uniform float uGrain; uniform float uVignette; uniform float uT2;
uniform float uImpact; uniform vec2 uImpactC; uniform float uImpactSeed; uniform float uLines; uniform vec3 uPaper; uniform vec3 uImpactInk; uniform vec3 uAccent;
uniform float uAberr; uniform float uFade; uniform vec3 uFadeColor; uniform float uTitleOn; uniform float uExposure;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 nrm(vec2 uv){ vec3 n = texture2D(tNormal, uv).rgb; if (any(isnan(n)) || dot(n,n) < 0.01) return vec3(0.0); n = n * 2.0 - 1.0; float l = length(n); return l > 1e-3 ? n / l : vec3(0.0); }
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 px = 1.0 / uRes;
  // chromatic aberration on hits
  vec3 col;
  if (uAberr > 0.0) { vec2 d = (vUv - 0.5) * uAberr * px * 6.0;
    col = vec3(texture2D(tColor, vUv + d).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv - d).b);
  } else col = texture2D(tColor, vUv).rgb;
  col *= uExposure;

  // ---- ink: hand-drawn feel = a little boil (on twos) and weight that grows when close
  float dc = lin(texture2D(tDepth, vUv).r); if (isnan(dc)) dc = uFar;
  vec2 boil = (vec2(vn(vUv * 9.0 + uT2 * 3.1), vn(vUv * 9.0 - uT2 * 2.3)) - 0.5) * 0.9 * px;
  float w = uInkW * clamp(1.7 / max(dc, 0.05), 0.75, 1.9);
  vec2 o = w * px;
  vec2 uv = vUv + boil;
  float dl = lin(texture2D(tDepth, uv - vec2(o.x, 0)).r), dr = lin(texture2D(tDepth, uv + vec2(o.x, 0)).r);
  float du = lin(texture2D(tDepth, uv + vec2(0, o.y)).r), dd = lin(texture2D(tDepth, uv - vec2(0, o.y)).r);
  float dmin = min(min(dl, dr), min(du, dd));
  float de = (max(abs(dl - dr), abs(du - dd))) / max(dmin, 0.05);
  // ignore smooth slopes: compare with second difference
  float dd2 = abs(dl + dr - 2.0 * dc) + abs(du + dd - 2.0 * dc);
  float depthEdge = smoothstep(uInkDepth, uInkDepth * 1.8, dd2 / max(dmin, 0.05)) ;
  vec3 nl = nrm(uv - vec2(o.x, 0)), nr = nrm(uv + vec2(o.x, 0)), nu = nrm(uv + vec2(0, o.y)), nd = nrm(uv - vec2(0, o.y));
  float ne = 1.0 - min(dot(nl, nr), dot(nu, nd));
  float normalEdge = smoothstep(uInkNormal, uInkNormal * 1.6, ne);
  float near = step(dmin, uFar * 0.98);   // only where something inkable is
  float edge = max(depthEdge, normalEdge) * near; if (isnan(edge)) edge = 0.0;
  col = mix(col, uInk, edge * uInkAmt);

  // ---- bloom
  col += texture2D(tBloom, vUv).rgb * uBloom;

  // ---- grade
  col = col * uGain + uLift * (1.0 - col);
  col = (col - 0.5) * uContrast + 0.5;
  float l = lum(col); col = mix(vec3(l), col, uSat);

  // ---- impact frames: 1 = negative, 2 = ink + paper + orange accent
  if (uImpact > 0.5) {
    float L = lum(col);
    // accent only where the unshifted picture is near marker orange (hue ~22 deg, saturated, bright): the trail
    vec3 src = texture2D(tColor, vUv).rgb;
    float mx = max(src.r, max(src.g, src.b)), mn = min(src.r, min(src.g, src.b)), sat = (mx - mn) / max(mx, 1e-3);
    float hue = (src.r >= mx) ? (src.g - src.b) / max(mx - mn, 1e-3) / 6.0 : 0.5;
    float accent = smoothstep(0.7, 0.85, sat) * smoothstep(0.68, 0.82, mx) * (1.0 - smoothstep(0.02, 0.035, abs(hue - 0.064)));
    vec3 imp;
    if (uImpact < 1.5) imp = mix(uPaper, uImpactInk, smoothstep(0.25, 0.6, L));
    else imp = mix(uImpactInk, uPaper, smoothstep(0.42, 0.5, L));
    imp = mix(imp, uAccent, accent);
    col = imp;
  }
  // ---- speed lines (radial, from uImpactC), drawn in ink or paper depending on mode
  if (uLines > 0.0) {
    vec2 p = (vUv - uImpactC) * vec2(uRes.x / uRes.y, 1.0);
    float a = atan(p.y, p.x), r = length(p);
    float s = h(vec2(floor(a * 70.0 / 6.2831 * 3.0), uImpactSeed));
    float stripe = step(0.72, s) * smoothstep(0.18 + s * 0.25, 0.55 + s * 0.3, r);
    float thin = smoothstep(0.5, 0.0, abs(fract(a * 70.0 / 6.2831 * 3.0) - 0.5) * 2.0 - (1.0 - s) * 0.2);
    vec3 lc = uImpact > 1.5 ? uImpactInk : (uImpact > 0.5 ? uImpactInk : uPaper);
    col = mix(col, lc, stripe * thin * uLines);
  }

  // ---- paper grain (changes on twos), vignette
  vec2 gp = vUv * uRes;
  float g = (h(gp + uT2 * 91.7) - 0.5) * 0.7 + (vn(gp * 0.25 + uT2 * 13.0) - 0.5) * 0.5;
  col *= 1.0 + g * uGrain;
  col *= 1.0 - uVignette * smoothstep(0.45, 1.0, length(vUv - 0.5) * 1.414);

  // ---- title + fade
  vec4 t = texture2D(tTitle, vUv);
  col = mix(col, t.rgb, t.a * uTitleOn);
  col = mix(col, uFadeColor, uFade);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const mk = (frag, uniforms) => { const m = new THREE.ShaderMaterial({ uniforms, vertexShader: quadVert, fragmentShader: frag, depthTest: false, depthWrite: false }); const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return { m, s }; };
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bright = mk(brightFrag, { tSrc: { value: null }, uThresh: { value: 0.72 } });
    this.blur = mk(blurFrag, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true;
    this.comp = mk(compFrag, {
      tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null }, tBloom: { value: null }, tTitle: { value: blank },
      uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 },
      uInk: { value: new THREE.Color("#0A0D16") }, uInkW: { value: 1.4 }, uInkAmt: { value: 0.92 }, uInkDepth: { value: 0.06 }, uInkNormal: { value: 0.32 },
      uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uContrast: { value: 1 },
      uBloom: { value: 0.4 }, uGrain: { value: 0.05 }, uVignette: { value: 0.3 }, uT2: { value: 0 },
      uImpact: { value: 0 }, uImpactC: { value: new THREE.Vector2(0.5, 0.5) }, uImpactSeed: { value: 0 }, uLines: { value: 0 },
      uPaper: { value: new THREE.Color("#F3EDE2") }, uImpactInk: { value: new THREE.Color("#0A0D16") }, uAccent: { value: new THREE.Color("#FF6B12") },
      uAberr: { value: 0 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color("#000000") }, uTitleOn: { value: 0 }, uExposure: { value: 1 },
    });
    this.blank = blank;
    this.normalMat = new THREE.MeshNormalMaterial();
    this.setSize(1920, 1080);
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    for (const k of ["rtColor", "rtInk", "rtB1", "rtB2"]) this[k]?.dispose();
    this.rtColor = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    this.rtInk = new THREE.WebGLRenderTarget(w, h, { depthTexture: new THREE.DepthTexture(w, h) });
    const bw = Math.round(w / 4), bh = Math.round(h / 4);
    this.rtB1 = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: false });
    this.rtB2 = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: false });
    this.comp.m.uniforms.uRes.value.set(w, h);
  }
  /** Render one frame of scene through camera with the given look settings (see Stage.look). */
  render(scene, camera, look) {
    const r = this.r, U = this.comp.m.uniforms;
    // colour
    r.setClearColor(look.clear ?? "#000000", 1);
    camera.layers.set(0);
    r.setRenderTarget(this.rtColor); r.clear(); r.render(scene, camera);
    // ink buffer: normals + depth of inkable things only
    camera.layers.set(INK);
    const bg = scene.background; scene.background = null;
    scene.overrideMaterial = this.normalMat;
    r.setClearColor("#000000", 0);
    r.setRenderTarget(this.rtInk); r.clear(); r.render(scene, camera);
    scene.overrideMaterial = null; scene.background = bg;
    camera.layers.set(0);
    // bloom (quarter res)
    this.bright.m.uniforms.tSrc.value = this.rtColor.texture; this.bright.m.uniforms.uThresh.value = look.bloomThresh ?? 0.72;
    r.setRenderTarget(this.rtB1); r.render(this.bright.s, this.cam);
    const bw = this.rtB1.width, bh = this.rtB1.height;
    for (const [src, dst, d] of [[this.rtB1, this.rtB2, [1.6 / bw, 0]], [this.rtB2, this.rtB1, [0, 1.6 / bh]], [this.rtB1, this.rtB2, [3.2 / bw, 0]], [this.rtB2, this.rtB1, [0, 3.2 / bh]]]) {
      this.blur.m.uniforms.tSrc.value = src.texture; this.blur.m.uniforms.uDir.value.set(...d);
      r.setRenderTarget(dst); r.render(this.blur.s, this.cam);
    }
    // composite to screen
    U.tColor.value = this.rtColor.texture; U.tNormal.value = this.rtInk.texture; U.tDepth.value = this.rtInk.depthTexture; U.tBloom.value = this.rtB1.texture;
    U.uNear.value = camera.near; U.uFar.value = camera.far;
    U.uInk.value.set(look.ink); U.uInkW.value = look.inkW ?? 1.4; U.uInkAmt.value = look.inkAmt ?? 0.92;
    U.uInkDepth.value = look.inkDepth ?? 0.06; U.uInkNormal.value = look.inkNormal ?? 0.32;
    U.uLift.value.set(...look.grade.lift); U.uGain.value.set(...look.grade.gain); U.uSat.value = look.grade.sat; U.uContrast.value = look.grade.contrast;
    U.uBloom.value = look.bloom; U.uGrain.value = look.grain; U.uVignette.value = look.vignette; U.uT2.value = look.t2;
    U.uImpact.value = look.impact ?? 0; U.uImpactC.value.set(...(look.impactC ?? [0.5, 0.5])); U.uImpactSeed.value = look.impactSeed ?? 0; U.uLines.value = look.lines ?? 0;
    U.uAberr.value = look.aberr ?? 0; U.uFade.value = look.fade ?? 0; U.uFadeColor.value.set(look.fadeColor ?? "#000000");
    U.tTitle.value = look.title ?? this.blank; U.uTitleOn.value = look.title ? 1 : 0; U.uExposure.value = look.exposure ?? 1;
    r.setRenderTarget(null); r.render(this.comp.s, this.cam);
  }
}
