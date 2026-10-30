// A folder drawn as an object, after "Glass Folder Cards" (21st.dev), rewritten for the site: a back panel holding a
// picture, the files it contains, and a frosted smoked-glass front panel hinged on its bottom edge that blurs them.
// Rest: closed, the tops of the files just show. Hover (a mouse) or focus: the glass leans toward you and the files
// lift. Open (a tap, Enter, Space): the glass falls further and the files rise out and fan, each one a link with its
// name on it. A key in the corner does the folder's one action. The picture is either a photo or generated: a
// domain-warped noise field shaded as a liquid surface, painted once per recipe over a few frames.
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";

export type ArtRecipe = {
  /** `marble` folds the colours through each other; `streak` pulls them into a long exposure */
  style: "marble" | "streak";
  colors: string[];
  scale?: number;
  warp?: number;
  angle?: number;
  gloss?: number;
  veins?: number;
};

export type FolderFile = {
  key: string;
  name: string;
  meta?: string;
  /** a photo: the file is a picture */
  image?: string;
  /** otherwise a sheet of paper: what is written on it */
  body?: ComponentChildren;
  href: string;
  onSelect: () => void;
};

// ---------------------------------------------------------------- the art
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : 0x808080;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** a small seedable random generator (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** a stable small integer for a string */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function makeFbm(seed: number): (x: number, y: number, octaves: number) => number {
  const r = rng(seed);
  const perm = new Uint8Array(512), grad = new Float32Array(512), p: number[] = [];
  for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; grad[i * 2] = Math.cos(a); grad[i * 2 + 1] = Math.sin(a); }
  const noise = (x: number, y: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const h00 = perm[X + perm[Y]] * 2, h10 = perm[X + 1 + perm[Y]] * 2, h01 = perm[X + perm[Y + 1]] * 2, h11 = perm[X + 1 + perm[Y + 1]] * 2;
    const d00 = grad[h00] * xf + grad[h00 + 1] * yf;
    const d10 = grad[h10] * (xf - 1) + grad[h10 + 1] * yf;
    const d01 = grad[h01] * xf + grad[h01 + 1] * (yf - 1);
    const d11 = grad[h11] * (xf - 1) + grad[h11 + 1] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    return d00 + u * (d10 - d00) + v * (d01 - d00 + u * (d11 - d01 - d10 + d00));
  };
  return (x, y, octaves) => {
    let sum = 0, amp = 0.5;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x, y);
      const nx = 1.6 * x + 1.2 * y + 7.1;
      y = -1.2 * x + 1.6 * y + 3.3;
      x = nx;
      amp *= 0.5;
    }
    return sum;
  };
}

type ArtJob = { width: number; height: number; pixels: Uint8ClampedArray; step: (rows: number) => boolean };

/** The picture as a job spread over frames: a field folded twice into itself, lit as the surface of a liquid. */
function createArtJob(width: number, height: number, recipe: ArtRecipe, seed: number): ArtJob {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const colors = recipe.colors.length >= 2 ? recipe.colors : ["#111111", "#eeeeee"];
  const stops = colors.map((c, i) => ({ t: i / (colors.length - 1), c: hexToRgb(c) }));
  const scale = recipe.scale ?? 0.7, warp = recipe.warp ?? 3, gloss = recipe.gloss ?? 0.4, veins = recipe.veins ?? 0;
  const streak = recipe.style === "streak";
  const fbm = makeFbm(seed * 977 + 13);
  const r = rng(seed + 1);
  const ox = r() * 50, oy = r() * 50;
  const angle = (recipe.angle ?? 0) + (r() - 0.5) * 0.5;
  const ca = Math.cos(angle), sa = Math.sin(angle), m = Math.min(w, h);
  // sampled on a half-resolution grid and brought up with Catmull-Rom (the slope stays smooth for the light)
  const gw = Math.ceil(w / 2) + 3, gh = Math.ceil(h / 2) + 3;
  const G = new Float32Array(gw * gh), GQ = new Float32Array(gw * gh), F = new Float32Array(w * h), Q = new Float32Array(w * h);
  const pixels = new Uint8ClampedArray(w * h * 4);
  let row = 0;
  const field = (gy: number) => {
    for (let gx = 0; gx < gw; gx++) {
      const u = ((gx - 1) * 2 - w / 2) / m, v = ((gy - 1) * 2 - h / 2) / m;
      let px = (u * ca - v * sa) * scale, py = (u * sa + v * ca) * scale;
      if (streak) { px *= 0.14; py *= 2.2; }
      px += ox; py += oy;
      const qx = fbm(px, py, 3), qy = fbm(px + 5.2, py + 1.3, 3);
      const rx = fbm(px + warp * qx + 1.7, py + warp * qy + 9.2, 3), ry = fbm(px + warp * qx + 8.3, py + warp * qy + 2.8, 3);
      G[gy * gw + gx] = fbm(px + warp * rx, py + warp * ry, 4);
      GQ[gy * gw + gx] = Math.sqrt(qx * qx + qy * qy);
    }
  };
  const upsample = () => {
    const cr = (a: number, b: number, c: number, d: number) => (-a + 9 * b + 9 * c - d) / 16;
    const T = new Float32Array(w * gh);
    for (let gy = 0; gy < gh; gy++) {
      const rr = gy * gw;
      for (let x = 0; x < w; x++) { const c = (x >> 1) + 1; T[gy * w + x] = x & 1 ? cr(G[rr + c - 1], G[rr + c], G[rr + c + 1], G[rr + c + 2]) : G[rr + c]; }
    }
    for (let y = 0; y < h; y++) {
      const c = (y >> 1) + 1;
      for (let x = 0; x < w; x++) {
        F[y * w + x] = y & 1 ? cr(T[(c - 1) * w + x], T[c * w + x], T[(c + 1) * w + x], T[(c + 2) * w + x]) : T[c * w + x];
        const gx = (x >> 1) + 1, q0 = GQ[c * gw + gx];
        const qx = x & 1 ? (q0 + GQ[c * gw + gx + 1]) / 2 : q0;
        const q1 = y & 1 ? (x & 1 ? (GQ[(c + 1) * gw + gx] + GQ[(c + 1) * gw + gx + 1]) / 2 : GQ[(c + 1) * gw + gx]) : qx;
        Q[y * w + x] = (qx + q1) / 2;
      }
    }
  };
  const colorize = () => {
    const sample: number[] = [];
    const stride = Math.max(1, Math.floor(F.length / 4096));
    for (let i = 0; i < F.length; i += stride) sample.push(F[i]);
    sample.sort((a, b) => a - b);
    const lo = sample[Math.floor(sample.length * 0.02)], hi = sample[Math.floor(sample.length * 0.98)];
    const k = 1 / (hi - lo || 1);
    const lx = -0.55, ly = -0.65, lz = 0.52, slope = k * m * 0.012;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let t = (F[i] - lo) * k;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        let j = 1;
        while (j < stops.length - 1 && stops[j].t < t) j++;
        const a = stops[j - 1], b = stops[j];
        let f = (t - a.t) / (b.t - a.t || 1);
        f = f < 0 ? 0 : f > 1 ? 1 : f;
        f = f * f * (3 - 2 * f);
        const gx = (F[x < w - 1 ? i + 1 : i] - F[x > 0 ? i - 1 : i]) * slope;
        const gy = (F[y < h - 1 ? i + w : i] - F[y > 0 ? i - w : i]) * slope;
        const nd = (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1);
        const spec = Math.pow(nd > 0 ? nd : 0, 24) * gloss * 255;
        const silk = 1 + 0.035 * Math.sin(t * 150 + Q[i] * 24);
        const vein = veins * Math.max(0, 1 - Math.abs(Q[i] - 0.42) * 14) * 0.6;
        const lit = (0.82 + 0.28 * nd) * silk * (1 - vein);
        pixels[i * 4] = (a.c[0] + (b.c[0] - a.c[0]) * f) * lit + spec;
        pixels[i * 4 + 1] = (a.c[1] + (b.c[1] - a.c[1]) * f) * lit + spec;
        pixels[i * 4 + 2] = (a.c[2] + (b.c[2] - a.c[2]) * f) * lit + spec;
        pixels[i * 4 + 3] = 255;
      }
    }
  };
  const step = (rows: number): boolean => {
    if (row >= gh) return true;
    const end = Math.min(gh, row + Math.max(1, rows));
    while (row < end) field(row++);
    if (row < gh) return false;
    upsample();
    colorize();
    return true;
  };
  return { width: w, height: h, pixels, step };
}

// one shared painter: every folder queues its picture here, and the queue spends a few milliseconds a frame
const artCache = new Map<string, Promise<HTMLCanvasElement>>();
const queue: { job: ArtJob; done: (c: HTMLCanvasElement) => void }[] = [];
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const tick = () => {
    const until = performance.now() + 6;
    while (queue.length && performance.now() < until) {
      const head = queue[0];
      if (head.job.step(4)) {
        queue.shift();
        const c = document.createElement("canvas");
        c.width = head.job.width;
        c.height = head.job.height;
        c.getContext("2d")?.putImageData(new ImageData(head.job.pixels as Uint8ClampedArray<ArrayBuffer>, c.width, c.height), 0, 0);
        head.done(c);
      }
    }
    if (queue.length) requestAnimationFrame(tick);
    else pumping = false;
  };
  requestAnimationFrame(tick);
}
function paint(recipe: ArtRecipe, seed: number, w: number, h: number): Promise<HTMLCanvasElement> {
  const key = JSON.stringify([recipe, seed, w, h]);
  let p = artCache.get(key);
  if (!p) {
    p = new Promise((done) => { queue.push({ job: createArtJob(w, h, recipe, seed), done }); pump(); });
    artCache.set(key, p);
  }
  return p;
}

function ArtCanvas({ recipe, seed, w, h, density, start }: { recipe: ArtRecipe; seed: number; w: number; h: number; density: number; start: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const key = JSON.stringify(recipe);
  const pw = Math.round(w * density), ph = Math.round(h * density);
  useEffect(() => {
    if (!start) return;
    let live = true;
    paint(JSON.parse(key) as ArtRecipe, seed, pw, ph).then((src) => {
      const c = ref.current;
      if (!live || !c) return;
      c.width = src.width;
      c.height = src.height;
      c.getContext("2d")?.drawImage(src, 0, 0);
      setReady(true);
    });
    return () => { live = false; };
  }, [key, seed, pw, ph, start]);
  return <canvas ref={ref} aria-hidden="true" class="gf-art" data-ready={ready || undefined} style={{ width: `${w}px`, height: `${h}px` }} />;
}

// ---------------------------------------------------------------- the folder (in its own units: 340 × 272, scaled to `width`)
const W = 340, H = 272;
/** room above the back panel for the files to rise into when the folder is open */
export const HEADROOM = 112;
const FRONT_TOP = 74, FRONT_H = H - FRONT_TOP;
const SHEET_W = 272, SHEET_H = 184;
const BACK_PATH = "M0 56A22 22 0 0 1 22 34L146 34C170 34 172 0 198 0L318 0A22 22 0 0 1 340 22L340 250A22 22 0 0 1 318 272L22 272A22 22 0 0 1 0 250Z";
const FRONT_PATH = `M0 22A22 22 0 0 1 22 0L118 0C144 0 146 32 172 32L318 32A22 22 0 0 1 340 54L340 ${FRONT_H - 22}A22 22 0 0 1 318 ${FRONT_H}L22 ${FRONT_H}A22 22 0 0 1 0 ${FRONT_H - 22}Z`;
const MAX_VISIBLE = 4;
const fanSlot = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * 2 - 1);

export type GlassFolderProps = {
  label: string;
  meta: string;
  /** a word or two on the glass, top left (where Ewan is now) */
  flag?: ComponentChildren;
  art: ArtRecipe;
  seed?: number;
  /** a photo for the back panel, instead of the generated picture */
  image?: string;
  files: FolderFile[];
  /** the folder's own key, bottom right */
  keyIcon: JSX.Element;
  keyLabel: string;
  onKey: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** what the hidden button says ("Open the folder Ship Cove – Anakiwa, 4 places") */
  openLabel: string;
  closeLabel: string;
  width: number;
  appearDelay?: number;
};

export function GlassFolder(props: GlassFolderProps) {
  const { label, meta, flag, art, seed = 3, image, files, keyIcon, keyLabel, onKey, open, onOpenChange, width, appearDelay = 0 } = props;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const [entered, setEntered] = useState(false);
  const k = width / W;
  const density = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)) * k;

  // the first time it comes into view, it assembles itself (and its picture starts painting)
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setEntered(true); return; }
    let t = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      t = window.setTimeout(() => setEntered(true), appearDelay);
    }, { threshold: 0.04 });
    io.observe(el);
    return () => { io.disconnect(); window.clearTimeout(t); };
  }, [appearDelay]);

  // a mouse moves the light and leans the folder a little (no re-render: two custom properties)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0, px = 0, py = 0;
    const write = () => { raf = 0; el.style.setProperty("--gf-px", px.toFixed(3)); el.style.setProperty("--gf-py", py.toFixed(3)); };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width) * 2 - 1;
      py = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(write);
    };
    const leave = () => { px = 0; py = 0; if (!raf) raf = requestAnimationFrame(write); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); };
  }, []);

  // closed, the files are out of the tab order
  useEffect(() => { filesRef.current?.toggleAttribute("inert", !open); }, [open]);

  // Escape, or a press anywhere else, closes it
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") { onOpenChange(false); hitRef.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onDown, true);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onDown, true); };
  }, [open]);

  // the newest files sit at the front, nearest the glass
  const start = Math.max(0, files.length - MAX_VISIBLE);
  const visible = files.slice(start);

  return (
    <div ref={rootRef} class="gf-root" data-open={open || undefined} data-entered={entered || undefined}
      style={{ width: `${width}px`, height: `${(H + HEADROOM) * k}px` }}>
      <div class="gf-stage" style={{ transform: `translateY(${HEADROOM * k}px) scale(${k})` }}>
        <div class="gf-tilt">
          <div class="gf-shadow" aria-hidden="true" />
          <div class="gf-back" style={{ clipPath: `path('${BACK_PATH}')` }} aria-hidden="true">
            {image
              ? <img class="gf-art gf-art--photo" src={image} alt="" width={W + 24} height={H + 24} draggable={false} loading="lazy" decoding="async" />
              : <ArtCanvas recipe={art} seed={seed} w={W + 24} h={H + 24} density={density} start={entered} />}
            <div class="gf-back-sheen" />
          </div>
          <svg class="gf-rim gf-back-rim" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><path d={BACK_PATH} /></svg>

          {/* the glass, hinged on its bottom edge */}
          <div class="gf-front" style={{ clipPath: `path('${FRONT_PATH}')` }}>
            <div class="gf-tint" aria-hidden="true" />
            <div class="gf-spec" aria-hidden="true" />
            <svg class="gf-rim gf-front-rim" viewBox={`0 0 ${W} ${FRONT_H}`} aria-hidden="true">
              <defs>
                <linearGradient id={`gf-rim-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#fff" stop-opacity="0.7" />
                  <stop offset="0.35" stop-color="#fff" stop-opacity="0.22" />
                  <stop offset="1" stop-color="#fff" stop-opacity="0.08" />
                </linearGradient>
              </defs>
              <path d={FRONT_PATH} stroke={`url(#gf-rim-${uid})`} />
            </svg>
            <button ref={hitRef} type="button" class="gf-hit" aria-expanded={open} data-sfx={open ? "close" : "open"}
              aria-label={open ? props.closeLabel : props.openLabel} onClick={() => onOpenChange(!open)} />
            {flag && <div class="gf-flag">{flag}</div>}
            <div class="gf-label">
              <span class="gf-title">{label}</span>
              <span class="gf-meta num">{meta}</span>
            </div>
          </div>

          {/* the contents: after the glass in the tab order, beneath it on screen */}
          <div ref={filesRef} class="gf-files" role="list" aria-label={label}>
            {visible.map((file, v) => {
              const slot = fanSlot(v, visible.length);
              const jitter = rng(hashString(file.key));
              const picture = !!file.image;
              return (
                <div key={file.key} role="listitem" class="gf-sheet-slot">
                  <a class={`gf-sheet${picture ? " gf-sheet--photo" : ""}`} href={file.href}
                    onClick={(e) => { e.preventDefault(); file.onSelect(); }}
                    style={{
                      "--gf-slot": slot, "--gf-depth": visible.length - 1 - v,
                      "--gf-jx": `${((jitter() - 0.5) * 10).toFixed(2)}px`, "--gf-jr": `${((jitter() - 0.5) * 3.2).toFixed(2)}deg`,
                      zIndex: v + 1,
                    } as JSX.CSSProperties}>
                    {picture
                      ? <img class="gf-sheet-art" src={file.image} alt="" width={SHEET_W} height={SHEET_H} draggable={false} loading="lazy" decoding="async" />
                      : <span class="gf-paper">{file.body}</span>}
                    <span class="gf-sheet-head">
                      <span class="gf-sheet-name">{file.name}</span>
                      {file.meta ? <span class="gf-sheet-meta num">{file.meta}</span> : null}
                    </span>
                  </a>
                </div>
              );
            })}
          </div>

          <button type="button" class="gf-key" aria-label={keyLabel} title={keyLabel} data-sfx="whoosh" onClick={onKey}>
            {keyIcon}
          </button>
        </div>
      </div>
    </div>
  );
}
