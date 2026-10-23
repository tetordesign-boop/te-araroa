// The whole trail as a small plain drawing, Ship Cove at the top right and Bluff at the bottom left, like the
// island: the flyover's map of where it is, and the stand-in for the map on devices that can't show it.
// Sizes are given in screen pixels; the drawing fits them whatever their shape.
import { useRef } from "preact/hooks";
import type { LngLat, Route } from "../lib/geo";
import { stationName, TIER1 } from "../map/map";

interface Sketch {
  W: number; H: number;
  X: (lng: number) => number; Y: (lat: number) => number;
  /** the route every km, to find the km under a finger */
  pts: { x: number; y: number; km: number }[];
  /** the whole route as a path (one piece per stretch between river crossings) */
  d: string;
}

const STEP = 1; // km between the points of the drawing: plenty at this size
const cache = new WeakMap<Route, Sketch>();

function sketchOf(r: Route): Sketch | null {
  const hit = cache.get(r);
  if (hit) return hit;
  const lines = r.sample(0, r.total, STEP);
  const b = r.bounds(lines);
  if (!b) return null;
  // a plain projection, fine at this size: longitude shrunk by the cosine of the island's middle latitude
  const k = Math.cos((((b[0][1] + b[1][1]) / 2) * Math.PI) / 180);
  const X = (lng: number) => (lng - b[0][0]) * k * 100;
  const Y = (lat: number) => (b[1][1] - lat) * 100;
  const pts: Sketch["pts"] = [];
  for (let km = 0; km <= r.total; km += STEP) { const [x, y] = r.pointAt(km); pts.push({ x: X(x), y: Y(y), km }); }
  const sk: Sketch = { W: X(b[1][0]), H: Y(b[0][1]), X, Y, pts, d: "" };
  sk.d = pathOf(sk, lines);
  cache.set(r, sk);
  return sk;
}

function pathOf(sk: Sketch, lines: LngLat[][]): string {
  return lines.map((l) => l.map(([x, y], i) => `${i ? "L" : "M"}${sk.X(x).toFixed(1)} ${sk.Y(y).toFixed(1)}`).join("")).join("");
}

export function TrailSketch({ route, width, height, walked = [], flownTo = null, point = null, ewan = null, labels = false, onPick, class: cls }: {
  route: Route;
  width: number;
  height: number;
  /** km ranges Ewan walked (orange) */
  walked?: [number, number][];
  /** the way from Ship Cove to this km (turquoise) */
  flownTo?: number | null;
  /** a point at this km (white, turquoise ring) */
  point?: number | null;
  /** where Ewan is (orange) */
  ewan?: LngLat | null;
  /** the main towns' names */
  labels?: boolean;
  /** a touch on the drawing: the km of the trail closest to it */
  onPick?: (km: number) => void;
  class?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const sk = sketchOf(route);
  if (!sk || width < 20 || height < 20) return null;
  // the drawing (and room for the names on its right) fitted in the box, centred, sizes in screen pixels
  const room = labels ? 1.42 : 1;
  const s = Math.min((width - 20) / (sk.W * room), (height - 20) / sk.H);
  const px = (v: number) => v / s;
  const vw = width / s, vh = height / s;
  const ox = -(vw - sk.W * room) / 2, oy = -(vh - sk.H) / 2;
  const walkedPath = walked.length ? pathOf(sk, walked.flatMap(([a, b]) => route.sample(a, b, STEP))) : "";
  const flownPath = flownTo !== null && flownTo > 0.05 ? pathOf(sk, route.sample(0, flownTo, STEP)) : "";
  const at = point !== null ? route.pointAt(point) : null;
  const towns = labels ? route.places().filter((p) => TIER1.has(p.n)) : [];

  const pick = (e: PointerEvent) => {
    const svg = ref.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm || !onPick) return;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best = sk.pts[0], bd = Infinity;
    for (const p of sk.pts) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < bd) { bd = d; best = p; } }
    onPick(best.km);
  };

  return (
    <svg ref={ref} class={`sketch${cls ? ` ${cls}` : ""}`} width={width} height={height} viewBox={`${ox.toFixed(1)} ${oy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`}
      onPointerDown={onPick ? (e) => { e.preventDefault(); pick(e as unknown as PointerEvent); } : undefined}>
      <path class="sketch__route" d={sk.d} />
      {/* (what Ewan walked stays orange over the flight's way, as on the map) */}
      {flownPath && <path class="sketch__flown" d={flownPath} />}
      {walkedPath && <path class="sketch__walked" d={walkedPath} />}
      {towns.map((p) => (
        <g>
          <circle class="sketch__town" cx={sk.X(p.c[0])} cy={sk.Y(p.c[1])} r={px(4.5)} style={{ strokeWidth: px(2) }} />
          <text class="sketch__name" x={sk.X(p.c[0]) + px(10)} y={sk.Y(p.c[1]) + px(4.5)} style={{ fontSize: px(13) }}>{stationName(p.n)}</text>
        </g>
      ))}
      {ewan && <circle class="sketch__ewan" cx={sk.X(ewan[0])} cy={sk.Y(ewan[1])} r={px(labels ? 8 : 5)} style={{ strokeWidth: px(labels ? 3 : 2) }} />}
      {at && (
        <g>
          <circle class="sketch__glow" cx={sk.X(at[0])} cy={sk.Y(at[1])} r={px(11)} />
          <circle class="sketch__point" cx={sk.X(at[0])} cy={sk.Y(at[1])} r={px(4.5)} style={{ strokeWidth: px(2.5) }} />
        </g>
      )}
    </svg>
  );
}
