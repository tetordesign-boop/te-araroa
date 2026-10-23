// When the map can't start (no WebGL 2: an older iPad, say): the trail as a plain drawing, with what Ewan walked
// and where he is, so the page still says where he is. The journal, the photos and the hut book work as usual.
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n";
import { latestPosition, livePlacement, phase, route, walked } from "../lib/data";
import type { LngLat } from "../lib/geo";
import { TrailSketch } from "./TrailSketch";

export function MapFallback() {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lp = livePlacement.value;
  const pos = latestPosition.value;
  const ewan: LngLat | null = phase.value === "before" ? null : lp?.onTrail ? lp.point : pos ? [pos.lng, pos.lat] : null;
  return (
    <div class="mapfb">
      <div class="mapfb__draw" ref={box} role="img" aria-label={t("mapFallback")}>
        <TrailSketch route={route.value} width={size[0]} height={size[1]} walked={walked.value.hike} ewan={ewan} labels />
      </div>
      <p class="mapfb__note">{t("mapFallback")}</p>
    </div>
  );
}
