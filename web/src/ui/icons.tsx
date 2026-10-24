import type { JSX } from "preact";
import walker from "../brand/walker.json";

type P = JSX.SVGAttributes<SVGSVGElement>;
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": true } as const;

export const ChevronLeft = (p: P) => <svg {...base} {...p}><path d="M15 5l-7 7 7 7" /></svg>;
export const ChevronRight = (p: P) => <svg {...base} {...p}><path d="M9 5l7 7-7 7" /></svg>;
export const ChevronUp = (p: P) => <svg {...base} {...p}><path d="M5 15l7-7 7 7" /></svg>;
export const Close = (p: P) => <svg {...base} {...p} stroke-width={2.25}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>;
export const Share = (p: P) => <svg {...base} {...p}><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" /><path d="M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1" /></svg>;
export const Locate = (p: P) => <svg {...base} {...p} fill="currentColor" stroke="none"><path d="M20.6 3.4a.9.9 0 00-1-.2L3.9 9.6a.9.9 0 00.1 1.7l6.6 2.1 2.1 6.6a.9.9 0 001.7.1l6.4-15.7a.9.9 0 00-.2-1z" /></svg>;
export const Layers = (p: P) => <svg {...base} {...p}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>;
export const Mountain = (p: P) => <svg {...base} {...p}><path d="M3 19l6.5-11 4 6.5 2.5-4L21 19H3z" /></svg>;
export const Play = (p: P) => <svg {...base} {...p} fill="currentColor" stroke="none"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.8l11-7.2a1 1 0 000-1.6l-11-7.2C7.9 3.5 7 4 7 4.8z" /></svg>;
export const Replay = (p: P) => <svg {...base} {...p}><path d="M3 20l5.5-9 3.5 5 2.5-3.5L21 20" /><circle cx="17" cy="5.5" r="2.2" fill="currentColor" stroke="none" /></svg>;
export const Pencil = (p: P) => <svg {...base} {...p}><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>;
export const AddSquare = (p: P) => <svg {...base} {...p}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></svg>;
export const Search = (p: P) => <svg {...base} {...p} stroke-width={2.3}><circle cx="10.8" cy="10.8" r="6.3" /><path d="M15.6 15.6L20 20" /></svg>;
export const Eye = (p: P) => <svg {...base} {...p}><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.9" fill="currentColor" stroke="none" /></svg>;
export const Pause = (p: P) => <svg {...base} {...p} fill="currentColor" stroke="none"><rect x="6.2" y="4.6" width="4" height="14.8" rx="1.3" /><rect x="13.8" y="4.6" width="4" height="14.8" rx="1.3" /></svg>;
export const Orbit = (p: P) => <svg {...base} {...p}><path d="M19.4 12.6a7.5 7.5 0 1 1-2.3-6" /><path d="M19.6 3.6v3.6H16" /><path d="M7.6 15.6l2.7-4.5 1.8 2.7 1.2-1.6 2.9 3.4z" fill="currentColor" stroke-width="1.2" /></svg>;
export const External = (p: P) => <svg {...base} {...p}><path d="M14 5h5v5M19 5l-8.5 8.5" /><path d="M18 13.5V18a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1h4.5" /></svg>;
export const MapIcon = (p: P) => <svg {...base} {...p}><path d="M9 4.5L3.8 6.6v12.9L9 17.4l6 2.1 5.2-2.1V4.5L15 6.6 9 4.5z" /><path d="M9 4.5v12.9M15 6.6v12.9" /></svg>;
export const Compass = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M12 2.8l3.4 9.2h-6.8z" fill="#ff3b30" />
    <path d="M12 21.2l-3.4-9.2h6.8z" fill="currentColor" opacity=".55" />
  </svg>
);
export const Check = (p: P) => <svg {...base} {...p} stroke-width={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const Trail = (p: P) => <svg {...base} {...p} fill="currentColor" stroke="none"><path d="M12 4.2c.5 0 .9.2 1.1.6l7.3 12.6c.5.9-.1 2-1.1 2H4.7c-1 0-1.6-1.1-1.1-2l7.3-12.6c.2-.4.6-.6 1.1-.6z" /></svg>;

/**
 * The brand mark, "Le marcheur": Ewan seen from behind, the way everyone who follows him sees him, the rolled mat
 * on top of a pack in the orange that means him all over the site, one foot lifting in the stride.
 * Geometry: src/brand/walker.json (scripts/brand draws the app icons, the favicon and the link preview from it).
 * `compact`: for 30 to 40 px, arms and legs a little bolder and no seam on the pack.
 * `intro`: for the presentation's entrance (app.css), a dim pack under the orange one, which lights up as he steps off.
 */
export const BrandMark = ({ compact = false, intro = false, ...p }: P & { compact?: boolean; intro?: boolean }) => {
  const w = compact ? walker.compact : walker.width;
  const c = walker.colors;
  const [hx, hy, hr] = walker.head, [mx, my, mw, mh, mr] = walker.mat, [px, py, pw, ph, pr] = walker.pack;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" {...p}>
      <g stroke={c.ink} stroke-linecap="round" fill="none">
        <path d={walker.arms} stroke-width={w.arm} />
        <path d={walker.legStand} stroke-width={w.leg} />
        <path class="mark__step" d={walker.legStep} stroke-width={w.leg} />
      </g>
      <circle cx={hx} cy={hy} r={hr} fill={c.ink} />
      {intro && <rect x={px} y={py} width={pw} height={ph} rx={pr} fill="#26365A" />}
      <g class="mark__pack">
        <rect x={px} y={py} width={pw} height={ph} rx={pr} fill={c.pack} />
        {!compact && <path d={walker.seam} stroke={c.seam} stroke-width={walker.width.seam} stroke-linecap="round" />}
      </g>
      <rect x={mx} y={my} width={mw} height={mh} rx={mr} fill={c.mat} />
    </svg>
  );
};
