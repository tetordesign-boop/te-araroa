// A folder drawn as an object, after "Glass Folder Cards" (21st.dev), rewritten for the site: a back panel holding a
// picture, the files it contains, and a frosted smoked-glass front panel hinged on its bottom edge that blurs them.
// Rest: closed, the tops of the files just show. Hover (a mouse) or focus: the glass leans toward you and the files
// lift. Open (a tap, Enter, Space): the glass falls further and the files rise out and fan, each one a link with its
// name on it. A key in the corner does the folder's one action. The picture is either a photo or generated: a
// domain-warped noise field shaded as a liquid surface, painted once per recipe over a few frames.
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { createArtJob, hashString, hexToRgb, rng, type ArtJob, type ArtRecipe } from "./glassArt";
import { Play } from "./icons";

export type { ArtRecipe } from "./glassArt";

export type FolderFile = {
  key: string;
  name: string;
  meta?: string;
  /** a photo: the file is a print of it */
  image?: string;
  /** the print is a video's picture (it gets a play mark) */
  video?: boolean;
  /** an empty frame, for a photo still to come: `body` says what */
  pending?: boolean;
  /** otherwise a sheet of paper: what is written on it */
  body?: ComponentChildren;
  /** what the link says to a screen reader, when the name and meta aren't enough */
  label?: string;
  href: string;
  onSelect: () => void;
};

// ---------------------------------------------------------------- the art
export { hashString, hexToRgb, rng };

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
        head.done(toCanvas(head.job.width, head.job.height, head.job.pixels));
      }
    }
    if (queue.length) requestAnimationFrame(tick);
    else pumping = false;
  };
  requestAnimationFrame(tick);
}
// the painter in its own thread: the pictures are worked out there and only drawn here (a few hundred microseconds),
// so a finger scrolling the journal is never kept waiting; where workers can't load, the queue above does it here
type ArtAsk = { recipe: ArtRecipe; seed: number; w: number; h: number; done: (c: HTMLCanvasElement) => void };
let worker: Worker | null | undefined;
const asked = new Map<number, ArtAsk>();
let nextAsk = 1;
const toCanvas = (width: number, height: number, pixels: Uint8ClampedArray) => {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  c.getContext("2d")?.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  return c;
};
const paintHere = (a: ArtAsk) => { queue.push({ job: createArtJob(a.w, a.h, a.recipe, a.seed), done: a.done }); pump(); };
function artWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const wk = new Worker(new URL("./glassArt.worker.ts", import.meta.url), { type: "module" });
    wk.onmessage = (e: MessageEvent<{ id: number; width: number; height: number; pixels: Uint8ClampedArray }>) => {
      const a = asked.get(e.data.id);
      asked.delete(e.data.id);
      a?.done(toCanvas(e.data.width, e.data.height, e.data.pixels));
    };
    wk.onerror = (e) => {
      e.preventDefault();
      worker = null;
      wk.terminate();
      for (const a of asked.values()) paintHere(a);
      asked.clear();
    };
    worker = wk;
  } catch (_) { worker = null; }
  return worker;
}
function paint(recipe: ArtRecipe, seed: number, w: number, h: number): Promise<HTMLCanvasElement> {
  const key = JSON.stringify([recipe, seed, w, h]);
  let p = artCache.get(key);
  if (!p) {
    p = new Promise((done) => {
      const a: ArtAsk = { recipe, seed, w, h, done };
      const wk = artWorker();
      if (!wk) { paintHere(a); return; }
      const id = nextAsk++;
      asked.set(id, a);
      wk.postMessage({ id, recipe, seed, w, h });
    });
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
              const kind = picture ? " gf-sheet--photo" : file.pending ? " gf-sheet--soon" : "";
              return (
                <div key={file.key} role="listitem" class="gf-sheet-slot">
                  <a class={`gf-sheet${kind}`} href={file.href} aria-label={file.label}
                    onClick={(e) => { e.preventDefault(); file.onSelect(); }}
                    style={{
                      "--gf-slot": slot, "--gf-depth": visible.length - 1 - v,
                      "--gf-jx": `${((jitter() - 0.5) * 10).toFixed(2)}px`, "--gf-jr": `${((jitter() - 0.5) * 3.2).toFixed(2)}deg`,
                      zIndex: v + 1,
                    } as JSX.CSSProperties}>
                    {picture
                      ? <>
                        <img class="gf-sheet-art" src={file.image} alt="" width={SHEET_W} height={SHEET_H} draggable={false} loading="lazy" decoding="async" />
                        {file.video && <span class="gf-sheet-play" aria-hidden="true"><Play /></span>}
                      </>
                      : <span class={file.pending ? "gf-soon" : "gf-paper"}>{file.body}</span>}
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
