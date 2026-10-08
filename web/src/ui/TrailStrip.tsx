import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { fmtKm } from "../lib/format";
import type { Route } from "../lib/geo";

/** The whole trail as one line, like a metro map: walked part in marker orange, transfers as breaks. */
export function TrailStrip({ route, walked, here }: { route: Route; walked: [number, number][]; here: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 340));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = route.total;
  const gaps = route.trail.gaps.map((g) => g.km).sort((a, b) => a - b);
  const GAP = 7, PAD = 4, Y = 14;
  const usable = w - 2 * PAD - gaps.length * GAP;
  const x = (km: number) => PAD + (km / total) * usable + gaps.filter((g) => g < km - 1e-6).length * GAP;
  const bounds = [0, ...gaps, total];
  const parts: [number, number][] = [];
  for (let i = 0; i < bounds.length - 1; i++) parts.push([bounds[i], bounds[i + 1]]);

  const segs: [number, number][] = [];
  for (const [a, b] of walked) for (const [p0, p1] of parts) {
    const s = Math.max(a, p0), e = Math.min(b, p1);
    if (e - s > 0.01) segs.push([s, e]);
  }
  const places = route.places();
  const next = here !== null ? places.find((p) => p.km > here + 0.5) : null;
  const l = lang.value;

  return (
    <div class="strip" ref={ref}>
      <svg viewBox={`0 0 ${w} 44`} role="img" aria-label={here !== null ? `${fmtKm(here, l)} ${t("walkedOf", { total: fmtKm(total, l) })}` : t("notStarted")}>
        {parts.map(([a, b]) => <line class="strip__base" x1={x(a) + 3} x2={x(b) - 3} y1={Y} y2={Y} />)}
        {segs.map(([a, b]) => <line class="strip__walked" x1={x(a) + 3} x2={Math.max(x(a) + 3, x(b) - 3)} y1={Y} y2={Y} />)}
        {places.slice(1, -1).filter((p) => STATIONS.has(p.n)).map((p) => <circle class="strip__station" cx={x(p.km)} cy={Y} r={1.7} />)}
        <text class="strip__label" x={PAD} y={Y + 26}>Ship Cove</text>
        <text class="strip__label strip__label--end" x={w - PAD} y={Y + 26}>Bluff</text>
        {here !== null && <circle class="strip__here" cx={Math.min(w - PAD - 3, Math.max(PAD + 3, x(here)))} cy={Y} r={7} />}
      </svg>
      {next && here !== null && here > 0 && (
        <div class="strip__next">{t("toPlace", { km: fmtKm(next.km - here, l), place: shortPlace(next.n) })}</div>
      )}
    </div>
  );
}

const STATIONS = new Set(["Havelock", "St Arnaud", "Boyle Village", "Arthur's Pass (Klondyke Corner)", "Lake Tekapo", "Twizel", "Wānaka", "Queenstown", "Riverton · Aparima", "Invercargill"]);

export const shortPlace =(n: string) => n.replace(" (Klondyke Corner)", "").replace(" · Stirling Point", "").replace(" · Meretoto", "").replace(" · Aparima", "").replace("Lake Coleridge · Rakaia", "Lake Coleridge");
