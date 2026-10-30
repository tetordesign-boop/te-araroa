// Ewan's photos on a curve: one row streaming from right to left round the inside of a cylinder, after "Scroll
// Tilted Grid" / "Tilted Grid Hero" (21st.dev), rewritten for the site. The centre faces you flat, the ends bend
// toward you and fade into the page. A CSS box can't bend, so each tile is cut into vertical strips, each a flat
// facet of the cylinder; the tile is what moves (one rotateY about the cylinder's axis), so its strips never drift
// apart. Transform-only, on the compositor; it stops when off screen, and stands still with reduced motion.
import { useEffect, useId, useRef, useState } from "preact/hooks";

const SLICES = 12;
/** camera distance, as a multiple of the cylinder's radius: just past the axis, so the ends swell toward you */
const CAMERA = 1.6;
/** a tile is never wider than this share of the band */
const MAX_WIDTH = 55;

/** radius, as a share of the band's width, that puts the frame's edge `bend` radians round the arc */
const arc = (bend: number) => (CAMERA - 1 + Math.cos(bend)) / (2 * CAMERA * Math.sin(bend));

function measure(width: number, height: number, tile: number, aspect: number, gap: number, bend: number) {
  const h = Math.min((tile / 100) * height, ((MAX_WIDTH / 100) * width) / aspect);
  const radius = width * arc(bend);
  if (!(h > 0) || !(radius > 0)) return { columns: 2, sweep: 0, unit: 0, limit: 0 };
  const deg = (rad: number) => (rad * 180) / Math.PI;
  const unit = deg(h / radius);
  const pitch = (aspect + gap / 100) * unit;
  const limit = deg(bend) + (aspect * unit) / 2;
  const columns = Math.min(40, Math.max(2, Math.ceil((2 * limit) / pitch)));
  const round = (n: number) => +n.toFixed(4);
  const sweep = round((columns * pitch) / 2);
  return { columns, sweep, unit: round(unit), limit: round(Math.min(sweep, limit)) };
}

/** whether this browser has container query units (Safari 16+): without them the band isn't drawn */
export const bandSupported = typeof CSS !== "undefined" && !!CSS.supports?.("width: 1cqw");

export function PhotoBand({ images, speed = 3.6, tileHeight = 72, aspect = 4 / 3, gap = 7, axis = 50, curve = 72, fade = 11, paused = false }: {
  images: string[];
  /** seconds for the row to advance by one tile */
  speed?: number;
  tileHeight?: number;
  aspect?: number;
  gap?: number;
  axis?: number;
  curve?: number;
  fade?: number;
  paused?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const orbit = `pb-o-${id}`, tile = `pb-t-${id}`;
  const bend = (Math.min(85, Math.max(5, curve)) * Math.PI) / 180;
  const [layout, setLayout] = useState<ReturnType<typeof measure> | null>(null);
  const [shown, setShown] = useState<Record<number, number>>({});
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const next = measure(width, height, tileHeight, aspect, gap, bend);
      setLayout((prev) => (prev && prev.columns === next.columns && prev.sweep === next.sweep && prev.unit === next.unit ? prev : next));
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, [tileHeight, aspect, gap, bend]);

  // a tile picks up its next picture just before it comes back into view: load them all now
  useEffect(() => { for (const src of images) new Image().src = src; }, [images]);

  const { columns, sweep, unit, limit } = layout ?? measure(380, 180, tileHeight, aspect, gap, bend);
  const u = (n: number) => `calc(${+n.toFixed(4)} * min(${tileHeight}cqh, ${+(MAX_WIDTH / aspect).toFixed(4)}cqw))`;
  const r = 100 * arc(bend);
  const radius = `${+r.toFixed(3)}cqw`;
  const turn = (deg: number) => `translateZ(${radius}) rotateY(${+deg.toFixed(4)}deg) translateZ(-${radius})`;
  const hide = +(((sweep - limit) / (2 * sweep || 1)) * 100).toFixed(4);
  const css = `@keyframes ${orbit}{from{transform:${turn(-sweep)}}to{transform:${turn(sweep)}}`
    + `0%,${hide}%,${100 - hide}%,100%{visibility:hidden}${hide + 0.001}%,${100 - hide - 0.001}%{visibility:visible}}`
    + `@media(prefers-reduced-motion:reduce){.${tile}{animation-play-state:paused!important}}`;
  const share = aspect / SLICES;
  const duration = columns * speed;
  const mask = `linear-gradient(90deg,transparent,#000 ${fade}%,#000 ${100 - fade}%,transparent)`;
  const still = paused || !onScreen;

  return (
    <div ref={ref} class="pband" aria-hidden="true" style={{ containerType: "size" }}>
      <style>{css}</style>
      <div class="pband__ring" style={{
        opacity: layout ? 1 : 0, perspective: `${+(r * CAMERA).toFixed(3)}cqw`, perspectiveOrigin: `50% ${axis}%`,
        maskImage: mask, WebkitMaskImage: mask,
      }}>
        {images.length > 0 && Array.from({ length: columns }, (_, t) => {
          const first = columns - 1 - t;
          const src = images[(shown[t] ?? first) % images.length];
          return (
            <div key={t} class={`${tile} pband__tile`}
              style={{
                left: `calc(50% - ${u(aspect / 2)})`, top: `calc(${axis}% - ${u(0.5)})`, width: u(aspect), height: u(1),
                animation: `${orbit} ${duration}s linear ${-t * speed}s infinite`, animationPlayState: still ? "paused" : "running",
              }}
              onAnimationIteration={(e: AnimationEvent) => {
                const lap = Math.round(e.elapsedTime / duration);
                setShown((prev) => { const next = lap * columns + first; return prev[t] === next ? prev : { ...prev, [t]: next }; });
              }}>
              {Array.from({ length: SLICES }, (_, k) => (
                <div key={k} class={`pband__strip${k === 0 ? " is-first" : ""}${k === SLICES - 1 ? " is-last" : ""}`}
                  style={{
                    left: u((aspect - share) / 2),
                    width: k === SLICES - 1 ? u(share) : `calc(${u(share)} + 1px)`,
                    height: u(1),
                    transform: turn((aspect / 2 - (k + 0.5) * share) * unit),
                  }}>
                  <img src={src} alt="" draggable={false} decoding="async" style={{ left: u(-k * share), width: u(aspect), height: u(1) }} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
