// When the map can't start (no WebGL 2: an older iPad, say): the trail as a plain drawing, with what Ewan walked
// and where he is, so the page still says where he is. The journal, the photos and the hut book work as usual.
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n";
import { latestPosition, livePlacement, phase, route, walked } from "../lib/data";
import type { LngLat } from "../lib/geo";
import { stationName, TIER1 } from "../map/map";

export function MapFallback() {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([360, 420]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize([el.clientWidth || 360, el.clientHeight || 420]));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const r = route.value;
  const lines = r.parts.map((p) => Array.from(p.lng, (x, i) => [x, p.lat[i]] as LngLat));
  const b = r.bounds(lines);
  if (!b) return null;
  // a plain projection, fine at this size: longitude shrunk by the cosine of the island's middle latitude
  const k = Math.cos((((b[0][1] + b[1][1]) / 2) * Math.PI) / 180);
  const X = (lng: number) => (lng - b[0][0]) * k * 100;
  const Y = (lat: number) => (b[1][1] - lat) * 100;
  const W = X(b[1][0]), H = Y(b[0][1]);
  // sizes in screen pixels whatever the drawing's scale (names need room on the right)
  const [cw, ch] = size;
  const s = Math.min(cw / (W * 1.42), ch / (H * 1.08)) || 1;
  const px = (v: number) => v / s;
  const vb = [-px(14), -px(14), W * 1.42, H * 1.08].map((v) => v.toFixed(1)).join(" ");
  const path = (ls: LngLat[][]) => ls.map((l) => l.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join("")).join("");
  const walkedPath = path(walked.value.hike.flatMap(([a, z]) => r.slice(a, z)));
  const lp = livePlacement.value;
  const pos = latestPosition.value;
  const here: LngLat | null = phase.value === "before" ? null : lp?.onTrail ? lp.point : pos ? [pos.lng, pos.lat] : null;
  const towns = r.places().filter((p) => TIER1.has(p.n));
  return (
    <div class="mapfb" ref={box}>
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("mapFallback")}>
        <path class="mapfb__route" d={path(lines)} />
        {walkedPath && <path class="mapfb__walked" d={walkedPath} />}
        {towns.map((p) => (
          <g>
            <circle class="mapfb__town" cx={X(p.c[0])} cy={Y(p.c[1])} r={px(4.5)} style={{ strokeWidth: px(2) }} />
            <text class="mapfb__name" x={X(p.c[0]) + px(10)} y={Y(p.c[1]) + px(4.5)} style={{ fontSize: px(13) }}>{stationName(p.n)}</text>
          </g>
        ))}
        {here && <circle class="mapfb__here" cx={X(here[0])} cy={Y(here[1])} r={px(8)} style={{ strokeWidth: px(3) }} />}
      </svg>
      <p class="mapfb__note">{t("mapFallback")}</p>
    </div>
  );
}
