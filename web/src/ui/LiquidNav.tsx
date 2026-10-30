// The site's main navigation: Ewan, Journal, Explorer, Stats. A pill of night glass with a drop of lake water in it,
// after "Waterline" (Nimbus UI, guglielmogiannattasio.it), rewritten for the site: the drop stretches toward the item
// you pick, splits into droplets on a long jump and merges back with a ripple; a touch sends a wave along the pill;
// a mouse lifts a meniscus; each icon plays its own little scene (his marker pings, a page turns, the needle swings,
// the bars rise). The water is a small WebGL shader drawn only inside the pill; without WebGL, a CSS drop.
// Unlike the original, the water calms down a few seconds after a touch and the drawing stops: nothing moves on its own.
import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { hikerName, lang, t } from "../i18n";
import { play } from "../lib/sound";
import { detent, go, hrefFor, view, type View } from "./state";

type Fx = "ping" | "page" | "needle" | "bars";
type Tab = { name: "home" | "journal" | "explore" | "stats"; label: string; icon: JSX.Element; fx: Fx };

const ico = (body: JSX.Element) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>
);
/** his marker on the map: an orange point and its ring */
const IconEwan = () => ico(<><circle class="lnav-ring" cx="12" cy="12" r="7.8" /><circle class="lnav-dot" cx="12" cy="12" r="3.3" stroke="none" /></>);
/** an open notebook, and the page that turns */
const IconJournal = () => ico(<>
  <path d="M12 6.6C9.6 5 6.8 4.6 4 5.4v13c2.8-.8 5.6-.4 8 1.2" />
  <path d="M12 6.6c2.4-1.6 5.2-2 8-1.2v13c-2.8-.8-5.6-.4-8 1.2V6.6z" />
  <path class="lnav-leaf" d="M12 6.6c2-1.3 4.2-1.7 6.4-1.3v12.6c-2.2-.4-4.4 0-6.4 1.3z" stroke-width="1.5" />
</>);
/** a compass, its needle */
const IconExplore = () => ico(<>
  <circle cx="12" cy="12" r="8.6" />
  <g class="lnav-needle"><path d="M12 6.3l2.4 5.7H9.6z" fill="currentColor" stroke="none" /><path d="M12 17.7L9.6 12h4.8z" stroke-width="1.3" /></g>
</>);
/** three bars, kilometres per day */
const IconStats = () => ico(<>
  <path class="lnav-bar" d="M6 19.2v-5.4" stroke-width="2.6" />
  <path class="lnav-bar" d="M12 19.2V7.4" stroke-width="2.6" />
  <path class="lnav-bar" d="M18 19.2v-8.8" stroke-width="2.6" />
</>);

/** Which tab a view belongs to (a day is in the journal, a place in the explorer); -1 for none ("À propos"). */
function tabOf(v: View): number {
  switch (v.name) {
    case "home": return 0;
    case "journal": case "day": return 1;
    case "explore": case "place": return 2;
    case "stats": return 3;
    default: return -1;
  }
}

const PAD = 14; // the canvas reaches this far past the pill, for its shadow and the ripples

// ---------------------------------------------------------------- the water
const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;uniform float uDpr;uniform float uTime;uniform vec4 uPill;
uniform vec4 uBlob[6];uniform float uSy[6];uniform vec4 uRip[6];uniform vec3 uMouse;uniform float uAmb;
uniform vec3 uTint;uniform vec3 uDeep;
float sdRB(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float sdCap(vec2 p,vec4 B,float sy){p-=B.xy;p.y/=sy;p.x=max(abs(p.x)-B.z,0.);return(length(p)-B.w)*min(1.,sy);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float dropD(vec2 p){float d=1e4;for(int i=0;i<6;i++){if(uBlob[i].w>.5){d=smin(d,sdCap(p,uBlob[i],uSy[i]),13.);}}return d;}
float pillD(vec2 p){vec2 h=uPill.zw*.5;return sdRB(p-uPill.xy-h,h,h.y);}
float lens(float d,float w){float t=clamp(-d/w,0.,1.);return sqrt(1.-(1.-t)*(1.-t));}
float waves(vec2 p){float w=0.;
 for(int i=0;i<6;i++){vec4 R=uRip[i];if(R.w>0.){float x=length(p-R.xy)-R.z*240.;w+=R.w*exp(-R.z*1.7)*sin(x*.3)*exp(-x*x/700.);}}
 vec2 m=p-uMouse.xy;w+=uMouse.z*3.6*exp(-dot(m,m)/1000.);
 w+=uAmb*(sin(p.x*.05+uTime*1.2)*.45+sin(p.x*.13-uTime*.85+p.y*.2)*.25);return w;}
float H(vec2 p){float dp=pillD(p);return lens(dp,uPill.w*.36)*2.4+lens(dropD(p),11.)*7.5+waves(p)*smoothstep(0.,7.,-dp);}
float caus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.1+t),cos(q.x*1.3-t*.7))*.6;c+=1./(1.+16.*abs(sin(q.x)*sin(q.y)));}return c/3.;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y*uDpr-gl_FragCoord.y)/uDpr;
 float dp=pillD(p);float dd=dropD(p);
 float h0=H(p);vec3 n=normalize(vec3(h0-H(p+vec2(1.,0.)),h0-H(p+vec2(0.,1.)),1.));
 vec3 V=vec3(0.,0.,1.);
 float spec=pow(max(dot(reflect(-normalize(vec3(-.45,-.8,.85)),n),V),0.),70.);
 float spec2=pow(max(dot(reflect(-normalize(vec3(.6,.75,.7)),n),V),0.),22.)*.3;
 float fres=clamp((1.-n.z)*4.,0.,1.);
 vec3 irid=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+fres*.85+p.x*.0028+uTime*.035));
 float pm=smoothstep(1.,-1.,dp);float dm=smoothstep(1.,-1.,dd)*smoothstep(1.,-2.,dp);
 float sh=smoothstep(9.,-9.,dropD(p-vec2(0.,5.)))*(1.-dm)*pm*.2;
 vec3 c=vec3(0.,.02,.07)*sh;float a=sh;
 float pa=clamp(pm*(fres*.42+spec*.8+spec2),0.,1.);
 c=mix(vec3(1.),irid,.45*fres)*pa+c*(1.-pa);a=pa+a*(1.-pa);
 float th=lens(dd,11.);
 float cs=caus((p+n.xy*th*18.)*.085,uTime*.9);
 float rim=dm*(1.-smoothstep(0.,8.,-dd));
 float cres=dm*smoothstep(.12,.55,dot(n.xy,normalize(vec2(.55,.85))))*smoothstep(0.,3.,-dd);
 float body=.5+.5*clamp(-n.y*3.,-1.,1.);
 float da=dm*(.2+.12*body);vec3 dc=mix(uTint,vec3(1.),body*.45);
 float la=rim*.3;dc=uDeep*la+dc*da*(1.-la);da=la+da*(1.-la);
 la=clamp(cres*.6+smoothstep(.6,1.,cs)*.3*th*dm,0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=clamp(dm*(spec*1.2+spec2*.5),0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=dm*smoothstep(-2.,0.,dd)*.4;dc=mix(vec3(1.),irid,.35)*la+dc*(1.-la);da=la+da*(1.-la);
 c=dc+c*(1.-da);a=da+a*(1.-da);
 gl_FragColor=vec4(c,a);
}`;

type GLC = { gl: WebGLRenderingContext; u: Record<string, WebGLUniformLocation | null> };
function initGL(canvas: HTMLCanvasElement): GLC | null {
  let gl: WebGLRenderingContext | null = null;
  try { gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: "low-power" }) as WebGLRenderingContext | null; } catch (_) { return null; }
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl!.createShader(type);
    if (!s) return null;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    return gl!.getShaderParameter(s, gl!.COMPILE_STATUS) ? s : null;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u: GLC["u"] = {};
  for (const n of ["uRes", "uDpr", "uTime", "uPill", "uBlob", "uSy", "uRip", "uMouse", "uAmb", "uTint", "uDeep"]) u[n] = gl.getUniformLocation(p, n);
  return { gl, u };
}

/** Chromium only, and only with a mouse: the glass also bends what is behind it (an SVG displacement). */
function canRefract() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
  return /Chrome\/|Edg\//.test(navigator.userAgent) && !!CSS.supports?.("backdrop-filter", "url(#a)");
}

type Body = { x: number; v: number };
type Sat = { x: number; y: number; vx: number; vy: number; r: number; k: number };
type Rip = { x: number; y: number; age: number; amp: number };

function makeState() {
  return {
    a: { x: 0, v: 0 } as Body, b: { x: 0, v: 0 } as Body,
    sy: { s: 1, v: 0 },
    lead: 0 as 0 | 1, lagFrom: 0,
    sats: [] as Sat[], rips: [] as Rip[],
    t: { x: 0, cy: 0, q: 0, r: 21 },
    q: 0,
    /** how much of the drop is there: 0 when no tab is current ("À propos") */
    there: 1, thereTo: 1,
    mouse: { x: 0, y: 0, s: 0, on: false },
    /** the water's own swell: up after a touch, then it calms and the drawing stops */
    amb: 0, ambUntil: 0,
    moving: false, split: false, ready: false,
    w: 0, h: 0, visible: true, reduce: false, raf: 0, last: 0, time: 0,
    glc: null as GLC | null,
  };
}

export function LiquidNav({ inert }: { inert?: boolean }) {
  const l = lang.value;
  const tabs: Tab[] = [
    { name: "home", label: hikerName.value || "Ewan", icon: IconEwan(), fx: "ping" },
    { name: "journal", label: t("navJournal"), icon: IconJournal(), fx: "page" },
    { name: "explore", label: t("navExplore"), icon: IconExplore(), fx: "needle" },
    { name: "stats", label: t("navStats"), icon: IconStats(), fx: "bars" },
  ];
  const current = tabOf(view.value);
  const navRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const st = useRef(makeState());
  const [gl, setGl] = useState<"on" | "off">("on");
  const [refract, setRefract] = useState(false);
  const [fx, setFx] = useState({ i: -1, n: 0 });

  // ---------------------------------------------------------------- drawing
  const draw = () => {
    const s = st.current, T = s.t;
    const sep = Math.abs(s.a.x - s.b.x);
    const thin = Math.min(sep / (2 * (s.q + T.r) || 1), 1);
    const r = T.r * (1 - 0.3 * thin) * s.there;
    if (s.glc) {
      const { gl: g, u } = s.glc;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
      g.uniform2f(u.uRes, s.w + PAD * 2, s.h + PAD * 2);
      g.uniform1f(u.uDpr, dpr);
      g.uniform1f(u.uTime, s.time);
      g.uniform4f(u.uPill, PAD, PAD, s.w, s.h);
      const blobs = new Float32Array(24);
      const sy = new Float32Array(6).fill(1);
      const head = s.lead === 0 ? s.a : s.b, tail = s.lead === 0 ? s.b : s.a;
      const k = s.there;
      blobs.set([head.x, T.cy, s.q * (1 - 0.25 * thin) * k, T.r * (1 - 0.12 * thin) * k, tail.x, T.cy, s.q * (1 - 0.8 * thin) * k, T.r * (1 - 0.5 * thin) * k], 0);
      sy[0] = sy[1] = s.sy.s;
      s.sats.slice(0, 4).forEach((d, i) => blobs.set([d.x, d.y, 0, d.r], 8 + i * 4));
      g.uniform4fv(u.uBlob, blobs);
      g.uniform1fv(u.uSy, sy);
      const rips = new Float32Array(24);
      s.rips.slice(-6).forEach((p, i) => rips.set([p.x, p.y, p.age, p.amp], i * 4));
      g.uniform4fv(u.uRip, rips);
      g.uniform3f(u.uMouse, s.mouse.x, s.mouse.y, s.mouse.s);
      g.uniform1f(u.uAmb, s.reduce ? 0 : s.amb);
      g.uniform3f(u.uTint, 0.42, 0.86, 0.93); // the lakes (--glacier, a touch lighter)
      g.uniform3f(u.uDeep, 0.03, 0.42, 0.5);
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      g.drawArrays(g.TRIANGLES, 0, 3);
    } else if (dropRef.current) {
      const left = Math.min(s.a.x, s.b.x) - s.q - r - PAD;
      dropRef.current.style.width = `${sep + 2 * (s.q + r)}px`;
      dropRef.current.style.transform = `translateX(${left}px) scaleY(${s.sy.s})`;
      dropRef.current.style.opacity = String(s.there);
    }
  };

  // ---------------------------------------------------------------- physics (springs, in px and seconds)
  const step = (dt: number, now: number) => {
    const s = st.current, T = s.t;
    s.time += dt;
    s.q += (T.q - s.q) * Math.min(1, dt * 12);
    s.there += (s.thereTo - s.there) * Math.min(1, dt * (s.reduce ? 60 : 7));
    if (Math.abs(s.thereTo - s.there) < 0.004) s.there = s.thereTo;
    const ambTo = now < s.ambUntil ? 1 : 0;
    s.amb += (ambTo - s.amb) * Math.min(1, dt * (ambTo ? 3 : 0.8));
    if (s.amb < 0.004 && !ambTo) s.amb = 0;
    const bodies = [s.a, s.b];
    let still = true;
    if (s.reduce) {
      s.a.x = s.b.x = T.x; s.a.v = s.b.v = 0; s.sy.s = 1; s.sats = [];
    } else {
      bodies.forEach((B, i) => {
        const lead = i === s.lead;
        const k = lead ? 210 : 72, c = lead ? 25 : 13;
        const f = !lead && now < s.lagFrom ? 0.08 : 1;
        B.v += (k * (T.x - B.x) - c * B.v) * dt * f;
        B.x += B.v * dt;
        const lo = PAD + 5 + s.q + T.r - 3, hi = PAD + s.w - 5 - s.q - T.r + 3;
        if (B.x < lo || B.x > hi) {
          s.sy.v -= Math.min(Math.abs(B.v), 900) * 0.0016;
          B.x = Math.max(lo, Math.min(hi, B.x));
          B.v *= -0.25;
        }
        if (Math.abs(T.x - B.x) > 0.3 || Math.abs(B.v) > 3) still = false;
      });
      const L = bodies[s.lead];
      const syT = 1 - 0.2 * Math.min(Math.abs(L.v) / 1500, 1);
      s.sy.v += (280 * (syT - s.sy.s) - 9 * s.sy.v) * dt;
      s.sy.s += s.sy.v * dt;
      if (Math.abs(s.sy.s - 1) > 0.002 || Math.abs(s.sy.v) > 0.02) still = false;
      // the neck breaks: droplets between head and tail
      const sep = Math.abs(s.a.x - s.b.x);
      const r = T.r * (1 - 0.3 * Math.min(sep / (2 * (T.q + T.r) || 1), 1));
      if (!s.split && s.moving && sep - 2 * T.q - 2 * r > -6) {
        s.split = true;
        const lo = bodies[1 - s.lead], hi = bodies[s.lead];
        [0.3, 0.5, 0.72].forEach((tt, j) => {
          s.sats.push({
            x: lo.x + (hi.x - lo.x) * tt + (Math.random() - 0.5) * 6, y: T.cy + (Math.random() - 0.5) * 10,
            vx: (lo.v + hi.v) * 0.45, vy: (Math.random() - 0.5) * 60, r: 5 + Math.random() * 3 - j * 0.5, k: 70 + Math.random() * 90,
          });
        });
      }
      s.sats = s.sats.filter((d) => {
        d.vx += (d.k * (T.x - d.x) - 9 * d.vx) * dt;
        d.vy += (90 * (T.cy - d.y) - 7 * d.vy) * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.x = Math.max(PAD + 8 + d.r, Math.min(PAD + s.w - 8 - d.r, d.x));
        d.y = Math.max(T.cy - T.r + d.r, Math.min(T.cy + T.r - d.r, d.y));
        if (Math.abs(T.x - d.x) < T.q + T.r * 0.5) d.r -= dt * 26;
        return d.r > 0.6;
      });
      if (s.sats.length) still = false;
    }
    if (s.moving && still) {
      s.moving = false;
      if (!s.reduce) s.rips.push({ x: T.x, y: T.cy, age: 0, amp: s.split ? 1.2 : 0.7 }); // it lands with a ripple
    }
    s.rips.forEach((p) => (p.age += dt));
    s.rips = s.rips.filter((p) => p.age < 2.4);
    s.mouse.s += ((s.mouse.on ? 1 : 0) - s.mouse.s) * Math.min(1, dt * 7);
  };

  const loop = () => {
    const s = st.current;
    if (s.raf || !s.visible) return;
    s.last = performance.now();
    const tick = (now: number) => {
      // real elapsed time, in small steps: the springs take the same time on a busy phone
      let left = Math.min((now - s.last) / 1000, 0.25);
      s.last = now;
      while (left > 1e-4) { const dt = Math.min(1 / 60, left); left -= dt; step(dt, now); }
      draw();
      const busy = s.moving || s.rips.length > 0 || s.sats.length > 0 || s.mouse.s > 0.01 || s.mouse.on
        || s.amb > 0 || now < s.ambUntil || s.there !== s.thereTo;
      s.raf = s.visible && busy ? requestAnimationFrame(tick) : 0;
    };
    s.raf = requestAnimationFrame(tick);
  };
  /** the water swells for a moment (a touch, a new tab), then calms */
  const stir = (ms = 2200) => {
    const s = st.current;
    if (s.reduce) { loop(); return; }
    s.ambUntil = Math.max(s.ambUntil, performance.now() + ms);
    loop();
  };

  // ---------------------------------------------------------------- layout
  const measure = () => {
    const nav = navRef.current;
    if (!nav) return;
    const s = st.current, T = s.t;
    s.w = nav.offsetWidth;
    s.h = nav.offsetHeight;
    s.thereTo = current >= 0 ? 1 : 0;
    const el = itemRefs.current[current >= 0 ? current : 0];
    if (el && current >= 0) {
      T.r = el.offsetHeight / 2;
      T.q = Math.max(0, el.offsetWidth / 2 - T.r);
      T.cy = PAD + el.offsetTop + el.offsetHeight / 2;
      const nx = PAD + el.offsetLeft + el.offsetWidth / 2;
      if (!s.ready) {
        s.a.x = s.b.x = nx;
        s.q = T.q;
        s.ready = true;
      } else if (Math.abs(nx - T.x) > 0.5) {
        s.lead = Math.abs(nx - s.a.x) <= Math.abs(nx - s.b.x) ? 0 : 1;
        s.lagFrom = performance.now() + 70;
        s.moving = true;
        s.split = false;
        stir();
      }
      T.x = nx;
    }
    const cv = canvasRef.current;
    if (cv) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = s.w + PAD * 2, H = s.h + PAD * 2;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        cv.style.width = `${W}px`;
        cv.style.height = `${H}px`;
      }
    }
    loop();
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useEffect(() => {
    setRefract(canRefract());
    const s = st.current;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    s.reduce = mq.matches;
    const onMq = () => { s.reduce = mq.matches; loop(); };
    mq.addEventListener?.("change", onMq);
    const cv = canvasRef.current;
    s.glc = cv ? initGL(cv) : null;
    if (!s.glc) setGl("off");
    const lost = (e: Event) => { e.preventDefault(); s.glc = null; setGl("off"); measureRef.current(); };
    cv?.addEventListener("webglcontextlost", lost);
    const io = new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; if (s.visible) loop(); });
    if (navRef.current) io.observe(navRef.current);
    const vis = () => { s.visible = document.visibilityState === "visible"; if (s.visible) loop(); };
    document.addEventListener("visibilitychange", vis);
    // typing in the sheet (a search, a note): on a phone the keyboard takes the bottom, the pill steps aside
    const typing = () => {
      const a = document.activeElement;
      document.documentElement.classList.toggle("is-typing", !!a?.closest(".sheet") && !!a.matches("input:not([type=checkbox]):not([type=radio]), textarea"));
    };
    document.addEventListener("focusin", typing);
    document.addEventListener("focusout", typing);
    // the drop settles in with a ring when the bar first appears
    let alive = true;
    window.setTimeout(() => {
      if (!alive) return;
      const T = s.t;
      if (!s.reduce && T.x) s.rips.push({ x: T.x, y: T.cy, age: 0, amp: 0.8 });
      stir(1600);
    }, 380);
    return () => {
      alive = false;
      cv?.removeEventListener("webglcontextlost", lost);
      mq.removeEventListener?.("change", onMq);
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      document.removeEventListener("focusin", typing);
      document.removeEventListener("focusout", typing);
      document.documentElement.classList.remove("is-typing");
      cancelAnimationFrame(s.raf);
      s.raf = 0;
      // free the GPU context now rather than when it is collected (the map has its own)
      try { s.glc?.gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch (_) { /* gone */ }
      s.glc = null;
    };
  }, []);

  useLayoutEffect(() => { measure(); }, [current, l, gl]);

  useEffect(() => {
    let lastW = -1, lastH = -1;
    const ro = new ResizeObserver(() => {
      const w = navRef.current?.offsetWidth ?? 0, h = navRef.current?.offsetHeight ?? 0;
      if (w !== lastW || h !== lastH) { lastW = w; lastH = h; st.current.ready = false; measureRef.current(); }
    });
    if (navRef.current) ro.observe(navRef.current);
    // the labels' font arriving changes the items' widths
    document.fonts?.ready.then(() => { st.current.ready = false; measureRef.current(); });
    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------------- touching it
  const local = (cx: number, cy: number) => {
    const r = navRef.current!.getBoundingClientRect();
    return { x: cx - r.left + PAD, y: cy - r.top + PAD };
  };
  const ripple = (x: number, y: number, amp: number) => {
    const s = st.current;
    if (s.reduce) return;
    s.rips.push({ x, y, age: 0, amp });
    stir();
  };

  const select = (i: number) => {
    const tab = tabs[i];
    setFx((f) => ({ i, n: f.n + 1 }));
    play("drip", 0.94 + i * 0.07);
    if (i === current && view.peek().name === tab.name) {
      // the current tab again: back to its top (and, for Ewan, the sheet a little higher)
      const body = document.querySelector<HTMLElement>(".sheet__body");
      if (body && body.scrollTop > 0) body.scrollTo({ top: 0, behavior: st.current.reduce ? "auto" : "smooth" });
      else if (tab.name === "home" && detent.peek() === "peek") detent.value = "half";
      return;
    }
    go({ name: tab.name }); // (from a day or a place too: back to the tab itself)
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    const at = itemRefs.current.indexOf(document.activeElement as HTMLAnchorElement);
    if (at < 0) return;
    e.preventDefault();
    const n = tabs.length;
    const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    itemRefs.current[to]?.focus();
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const p = local(e.clientX, e.clientY), s = st.current;
    s.mouse.x = p.x; s.mouse.y = p.y; s.mouse.on = true;
    loop();
  };

  return (
    <>
    {/* where the sheet's content meets the pill, it fades out under the glass */}
    <div class="lnav-fade" aria-hidden="true" />
    <nav ref={navRef} class="lnav" aria-label={t("navLabel")} inert={inert}
      data-gl={gl} data-refract={refract ? "on" : "off"}
      onKeyDown={onKeyDown}
      onPointerMove={onMove}
      onPointerLeave={() => { st.current.mouse.on = false; loop(); }}
      onPointerDown={(e) => { const p = local(e.clientX, e.clientY); ripple(p.x, p.y, 0.8); }}>
      {refract && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <filter id="lnav-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.02" numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
            <feDisplacementMap in="SourceGraphic" in2="soft" scale="40" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <span class="lnav__glass" aria-hidden="true" />
      <canvas class="lnav__water" ref={canvasRef} aria-hidden="true" />
      <span class="lnav__drop" ref={dropRef} aria-hidden="true" />
      {tabs.map((tab, i) => {
        const playing = fx.i === i;
        return (
          <a key={tab.name} ref={(el) => { itemRefs.current[i] = el; }} class={`lnav__item lnav__item--${tab.name}`}
            href={hrefFor({ name: tab.name })} aria-current={i === current ? (view.value.name === tab.name ? "page" : "true") : undefined} data-sfx="none"
            onClick={(e) => { e.preventDefault(); select(i); }}>
            <span class="lnav__ico" key={playing ? fx.n : 0} data-fx={playing ? tab.fx : undefined}>
              {tab.icon}
            </span>
            <span class="lnav__label">{tab.label}</span>
          </a>
        );
      })}
    </nav>
    </>
  );
}
