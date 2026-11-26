// The stage builds one shot at a time (env + painted layers + kiwi + FX), then poses everything for a time t and
// renders it through the passes. Departments plug in through src/world/<env>.js, src/kiwi/kiwi.js, src/fx/<type>.js.
import * as THREE from "three";
import * as T from "./time.js";
import * as paint from "./paint.js";
import { RIGS, PALETTE } from "./rigs.js";
import { RIG_U, celMaterial, outlineMaterial, inkable, INK } from "./cel.js";
import { cover, brushify, layerMesh } from "./layers.js";
import { Post } from "./post.js";
import { Title, loadFont } from "./title.js";
import { SHOTS, TITLE } from "../shots.js";

export const ASPECTS = { "16x9": [1920, 1080], "9x16": [1080, 1920] };
const V = (a) => new THREE.Vector3(...a);

export class Stage {
  constructor(canvas) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.post = new Post(this.renderer);
    this.camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.02, 5000);
    this.title = new Title();
    this.shot = null; this.aspect = "16x9"; this.lang = "fr"; this.verbose = true;
  }
  /** Block until the GPU has finished (for honest timings). */
  sync() { const gl = this.renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  setAspect(aspect) {
    this.aspect = aspect; const [w, h] = ASPECTS[aspect];
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false); this.post.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  shotAt(t) { return SHOTS.find((s) => t >= s.t0 - 1e-6 && t < s.t1 - 1e-6) ?? SHOTS[SHOTS.length - 1]; }

  // ---------------------------------------------------------------- camera
  /** Camera state for a shot at time t (no shake). Keys: {t, pos, look, fov, roll?, e?}; pos/look may be {kiwi, off}. */
  camAt(shot, aspect, t, withShake = true) {
    const keys = shot.cam[aspect] ?? shot.cam["16x9"];
    const resolve = (v, tt) => {
      if (Array.isArray(v)) return v;
      if (v && v.kiwi && this.kiwi) { this.kiwi.update(tt, tt, shot.kiwi, this.ctx); const p = this.kiwi.anchor(v.kiwi); return [p.x + (v.off?.[0] ?? 0), p.y + (v.off?.[1] ?? 0), p.z + (v.off?.[2] ?? 0)]; }
      return [0, 0, 0];
    };
    let a = keys[0], b = keys[keys.length - 1], f = 0;
    if (t <= keys[0].t) { a = b = keys[0]; } else if (t >= b.t) { a = b; } else {
      for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) { a = keys[i - 1]; b = keys[i]; break; }
      f = (T.ease[b.e || "inOut"])((t - a.t) / (b.t - a.t || 1));
    }
    const pa = resolve(a.pos, t), pb = resolve(b.pos, t), la = resolve(a.look, t), lb = resolve(b.look, t);
    const st = { pos: pa.map((x, i) => T.lerp(x, pb[i], f)), look: la.map((x, i) => T.lerp(x, lb[i], f)), fov: T.lerp(a.fov, b.fov, f), roll: T.lerp(a.roll ?? 0, b.roll ?? 0, f) };
    if (withShake) {
      let amp = 0;
      for (const s of shot.shake ?? []) { const u = t - s.t; if (u >= 0 && u < (s.dur ?? 0.6)) amp += s.amp * Math.exp(-u * (s.decay ?? 6)); }
      if (amp > 0) { st.shake = [T.noise1(t * 18, 3) * amp, T.noise1(t * 18, 7) * amp, T.noise1(t * 14, 11) * amp * 0.5]; }
    }
    return st;
  }
  applyCam(st) {
    const c = this.camera; c.position.set(...st.pos); c.up.set(0, 1, 0); c.lookAt(...st.look);
    if (st.roll) c.rotateZ(THREE.MathUtils.degToRad(st.roll));
    if (st.shake) { c.rotateY(THREE.MathUtils.degToRad(st.shake[0])); c.rotateX(THREE.MathUtils.degToRad(st.shake[1])); c.rotateZ(THREE.MathUtils.degToRad(st.shake[2])); }
    c.fov = st.fov; c.updateProjectionMatrix(); c.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- build
  dispose() {
    if (!this.scene) return;
    for (const f of this.fx ?? []) f.dispose?.();
    this.envBuilt?.dispose?.(); this.kiwi?.dispose?.();
    for (const l of this.layers ?? []) l.dispose();
    // free painted textures of the last shot, except the ones a department keeps across shots (userData.keep)
    for (const b of this.extraTex ?? []) if (!b.texture.userData?.keep) b.dispose();
    this.extraTex = (this.extraTex ?? []).filter((b) => b.texture.userData?.keep);
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { for (const v of Object.values(x.uniforms ?? {})) if (v.value?.isTexture && !v.value.userData?.keep) v.value.dispose(); x.map?.dispose?.(); x.dispose(); }); });
    this.scene = null;
  }
  async build(shot) {
    const tBuild = performance.now();
    this.dispose();
    await loadFont();
    const rig = RIGS[shot.rig]; this.rig = rig;
    const scene = new THREE.Scene(); this.scene = scene;
    scene.background = new THREE.Color(rig.fog.color);
    const ctx = this.ctx = {
      THREE, T, paint, PALETTE, RIGS, rig, shot, opts: shot.envOpts ?? {}, scene, camera: this.camera, renderer: this.renderer,
      celMaterial, outlineMaterial, inkable, INK, stage: this, aspect: this.aspect,
      heightAt: () => 0,
      /** Paint a free texture (for 3D props/terrain): paintFn(g, w, h) on a w*h canvas, then the brush pass. */
      paintTexture: (w, h, fn, brush = {}) => { const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); const b = brushify(this.renderer, c, brush); (this.extraTex ??= []).push(b); return b.texture; },
    };
    // env (3D first: ground, props, heightAt)
    const env = (await import(`/src/world/${shot.env}.js`)).default; this.env = env;
    this.envBuilt = (await env.build?.(ctx)) ?? {};
    if (this.envBuilt.group) scene.add(this.envBuilt.group);
    if (this.envBuilt.heightAt) ctx.heightAt = this.envBuilt.heightAt;
    // kiwi
    this.kiwi = null;
    if (shot.kiwi) { const K = (await import("/src/kiwi/kiwi.js")).default; this.kiwi = await K.create(ctx); ctx.kiwi = this.kiwi; scene.add(this.kiwi.root); }
    // camera samples over the shot, both aspects -> layers
    const cams = [];
    for (const asp of Object.keys(ASPECTS)) {
      const [w, h] = ASPECTS[asp];
      for (let i = 0; i <= 12; i++) {
        const t = T.lerp(shot.t0, shot.t1 - 1e-3, i / 12); const st = this.camAt(shot, asp, t, false);
        const c = new THREE.PerspectiveCamera(st.fov, w / h); c.position.set(...st.pos); c.lookAt(...st.look); if (st.roll) c.rotateZ(THREE.MathUtils.degToRad(st.roll));
        const shakeMargin = Math.max(0, ...(shot.shake ?? []).map((s) => s.amp)) * 2;
        cams.push({ pos: c.position.clone(), quat: c.quaternion.clone(), fov: st.fov + shakeMargin, aspect: w / h });
      }
    }
    this.cams = cams;
    this.layers = [];
    for (const ly of this.noLayers ? [] : env.layers ?? []) {
      const L = cover(cams, ly.depth, { outH: 1080 * (ly.quality ?? 1), margin: ly.margin ?? 0.1, maxPx: ly.maxPx ?? 4096 });
      const tp = performance.now();
      const c = document.createElement("canvas"); c.width = L.w; c.height = L.h;
      const g = c.getContext("2d"); ly.paint(g, L, ctx);
      let src = c;
      if (ly.blur) { const c2 = document.createElement("canvas"); c2.width = L.w; c2.height = L.h; const g2 = c2.getContext("2d"); g2.filter = `blur(${ly.blur}px)`; g2.drawImage(c, 0, 0); src = c2; }
      const tb = performance.now(); const b = brushify(this.renderer, src, ly.brush ?? {}); this.sync();
      if (this.verbose) console.log(`layer ${shot.id}/${ly.name} ${L.w}x${L.h} paint ${Math.round(tb - tp)} ms, brush ${Math.round(performance.now() - tb)} ms`);
      const mesh = layerMesh(L, b.texture, { flash: ly.flash ?? 0.5 });
      mesh.name = `layer:${ly.name}`; scene.add(mesh);
      this.layers.push({ name: ly.name, L, mesh, dispose: b.dispose, spec: ly });
    }
    ctx.layers = this.layers;
    // fx
    this.fx = [];
    for (const spec of shot.fx ?? []) {
      const F = (await import(`/src/fx/${spec.type}.js`)).default;
      const fx = await F.create(ctx, spec); fx.spec = spec; this.fx.push(fx);
      if (fx.object) scene.add(fx.object);
    }
    this.envBuilt.ready?.(ctx);
    this.shot = shot;
    if (this.verbose) console.log(`build ${shot.id} ${Math.round(performance.now() - tBuild)} ms`);
  }

  // ---------------------------------------------------------------- pose + render
  pose(t) {
    const shot = this.shot, ctx = this.ctx, t2 = T.twos(t);
    ctx.t = t; ctx.t2 = t2;
    const st = this.camAt(shot, this.aspect, t); this.applyCam(st); this.camState = st;   // may pose the kiwi at (t, t) for anchors
    this.kiwi?.update(t, t2, shot.kiwi, ctx);                                              // the drawn pose (on twos)
    this.envBuilt.update?.(t, t2, ctx);
    for (const f of this.fx) f.update?.(t, t2, ctx);
    // rig -> shared uniforms (view space)
    const rig = this.rig, vm = this.camera.matrixWorldInverse;
    RIG_U.uKeyDir.value.copy(V(rig.key.from).normalize()).transformDirection(vm);
    const dim = shot.dim ? T.lerp(1, shot.dim.key ?? 0.6, T.smooth((t - shot.dim.t0) / (shot.dim.t1 - shot.dim.t0))) : 1;
    RIG_U.uKeyColor.value.set(rig.key.color).multiplyScalar(rig.key.power * dim);
    RIG_U.uShade.value.set(rig.shade);
    RIG_U.uRimDir.value.copy(V(rig.rim.from).normalize()).transformDirection(vm);
    RIG_U.uRimColor.value.set(rig.rim.color); RIG_U.uRimPower.value = rig.rim.power;
    RIG_U.uAmbient.value = rig.ambient; RIG_U.uBandSoft.value = rig.bandSoft;
    RIG_U.uFogColor.value.set(rig.fog.color); RIG_U.uFogNear.value = rig.fog.near; RIG_U.uFogFar.value = rig.fog.far;
    let flash = 0; for (const f of shot.flash ?? []) { const u = t - f.t; if (u >= 0) flash = Math.max(flash, (f.k ?? 1) * Math.exp(-u / (f.dur ?? 0.12))); }
    for (const f of this.fx) if (f.flash) flash = Math.max(flash, f.flash(t, t2) ?? 0);
    RIG_U.uFlash.value = T.clamp(flash);
  }
  look(t) {
    const shot = this.shot, rig = this.rig, lk = { ...(shot.look ?? {}) };
    const out = {
      ink: lk.ink ?? rig.ink, inkW: lk.inkW ?? 1.4, inkAmt: lk.inkAmt ?? 0.92, inkDepth: lk.inkDepth, inkNormal: lk.inkNormal,
      grade: rig.grade, bloom: lk.bloom ?? rig.bloom, bloomThresh: lk.bloomThresh, grain: rig.grain, vignette: lk.vignette ?? rig.vignette,
      t2: T.twos(t), clear: rig.fog.color, exposure: shot.dim ? T.lerp(1, shot.dim.exposure ?? 0.85, T.smooth((t - shot.dim.t0) / (shot.dim.t1 - shot.dim.t0))) : 1,
    };
    // impact frames: seq letters per frame from t: N = negative, I = ink+orange, - = normal (lines only)
    for (const im of shot.impacts ?? []) {
      const n = Math.floor((t - im.t) * T.FPS + 1e-4);
      if (n >= 0 && n < im.seq.length) {
        const ch = im.seq[n]; out.impact = ch === "N" ? 1 : ch === "I" ? 2 : 0; out.impactC = im.c ?? [0.5, 0.5];
        out.impactSeed = Math.floor(n / 2) + im.t; out.lines = im.lines ?? 1; out.aberr = im.aberr ?? 0;
      } else if (n >= im.seq.length && n < im.seq.length + 8) { out.aberr = Math.max(out.aberr ?? 0, (im.aberr ?? 1.5) * (1 - (n - im.seq.length) / 8)); }
    }
    for (const f of this.fx) if (f.look) Object.assign(out, f.look(t, T.twos(t)) ?? {});
    // fades
    const fd = shot.fade ?? {};
    if (fd.in) out.fade = Math.max(out.fade ?? 0, 1 - T.smooth((t - shot.t0) / fd.in));
    if (fd.out) out.fade = Math.max(out.fade ?? 0, T.smooth((t - (shot.t1 - fd.out)) / fd.out));
    if (fd.color) out.fadeColor = fd.color;
    // title
    if (shot.title) { const [w, h] = ASPECTS[this.aspect]; out.title = this.title.draw(t, w, h, { ...TITLE, t0: shot.title.t0 }, this.lang); }
    return out;
  }
  async render(t) {
    const shot = this.shotAt(t);
    if (shot !== this.shot) await this.build(shot);
    this.pose(t);
    this.post.render(this.scene, this.camera, this.look(t));
  }
}
