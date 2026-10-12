import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { fmtKm } from "../lib/format";
import type { Route } from "../lib/geo";

/**
 * The whole trail as one line, like a metro diagram: the part Ewan walked in marker orange,
 * the river and lake crossings he can't walk as breaks. The large version names the towns.
 */
export function TrailStrip({ route, walked, here, large, legendAt }: { route: Route; walked: [number, number][]; here: number | null; large?: boolean; legendAt?: number | null }) {
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
  const SW = large ? 8 : 6;
  const R = large ? 9 : 7.5;
  const GAP = 7, PAD = R;
  const Y = large ? 24 : R + 1;           // large: room for names above the line
  const H = large ? Y + SW / 2 + 24 : Y * 2;
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
  const at = legendAt !== undefined ? legendAt : here; // the legend names the real next stop, even while the line animates
  const next = at !== null ? places.find((p) => p.km > at + 0.5) : null;
  const l = lang.value;
  const towns = large ? places.filter((p) => TOWNS.has(p.n)) : [];
  const inset = SW / 2;

  return (
    <div class={`strip${large ? " strip--large" : ""}`} ref={ref}>
      <svg viewBox={`0 0 ${w} ${H}`} height={H} role="img"
        aria-label={here !== null ? `${fmtKm(here, l, 0)} ${t("walkedOf", { total: fmtKm(total, l, 0) })}` : t("notStarted")}>
        {parts.map(([a, b]) => <line class="strip__base" x1={x(a) + inset} x2={x(b) - inset} y1={Y} y2={Y} stroke-width={SW} />)}
        {segs.map(([a, b]) => <line class="strip__walked" x1={x(a) + inset} x2={Math.max(x(a) + inset, x(b) - inset)} y1={Y} y2={Y} stroke-width={SW} />)}
        {places.slice(1, -1).filter((p) => STATIONS.has(p.n)).map((p) => <circle class="strip__station" cx={x(p.km)} cy={Y} r={large ? 2 : 1.6} />)}
        {large && placeTowns([
          { x: PAD - R + 1, name: "Ship Cove", end: true },
          { x: w - PAD + R - 1, name: "Bluff", end: true },
          ...towns.map((p) => ({ x: x(p.km), name: townName(p.n), end: false })),
        ], w).map(({ x: tx, name, row, anchor, end }) => (
          // like a metro map: names alternate below and above the line, each next to its station
          <text class={`strip__town${end ? " is-end" : ""}`} x={tx} y={row ? Y - SW / 2 - 7 : Y + SW / 2 + 16} text-anchor={anchor}>{name}</text>
        ))}
        {here !== null && <circle class="strip__here" cx={Math.min(w - PAD, Math.max(PAD, x(here)))} cy={Y} r={R} />}
      </svg>
      {!large && (
        <div class="strip__legend">
          <span>Ship Cove</span>
          {next && at !== null && at > 0
            ? <span class="strip__next"><strong class="num">{fmtKm(next.km - at, l)} km</strong> {t("beforePlace", { place: shortPlace(next.n) })}</span>
            : <span class="strip__next" />}
          <span>Bluff</span>
        </div>
      )}
    </div>
  );
}

const townName = (n: string) => shortPlace(n).replace("Lake Tekapo", "Tekapo");

/** Town names below the line, or above it when there is no room; a name that would touch another is left out. */
function placeTowns(items: { x: number; name: string; end: boolean }[], w: number) {
  const width = (s: string) => s.length * 6.2 + 8;
  const rows: [number, number][][] = [[], []];
  const out: { x: number; name: string; end: boolean; row: number; anchor: "start" | "middle" | "end" }[] = [];
  for (const it of items) {
    const tw = width(it.name);
    const anchor = it.x - tw / 2 < 0 ? "start" : it.x + tw / 2 > w ? "end" : "middle";
    const x0 = anchor === "start" ? it.x : anchor === "end" ? it.x - tw : it.x - tw / 2;
    const x1 = x0 + tw;
    for (let r = 0; r < (it.end ? 1 : 2); r++) {
      if (rows[r].every(([a, b]) => x1 <= a || x0 >= b)) {
        rows[r].push([x0, x1]);
        out.push({ ...it, row: r, anchor });
        break;
      }
    }
  }
  return out;
}

const STATIONS = new Set(["Havelock", "St Arnaud", "Boyle Village", "Arthur's Pass (Klondyke Corner)", "Lake Tekapo", "Twizel", "Wānaka", "Queenstown", "Riverton · Aparima", "Invercargill"]);
const TOWNS = new Set(["Havelock", "St Arnaud", "Arthur's Pass (Klondyke Corner)", "Lake Tekapo", "Wānaka", "Queenstown", "Invercargill"]);

export const shortPlace = (n: string) => n.replace(" (Klondyke Corner)", "").replace(" · Stirling Point", "").replace(" · Meretoto", "").replace(" · Aparima", "").replace("Lake Coleridge · Rakaia", "Lake Coleridge");
