import type { JSX } from "preact";

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
export const Trail = (p: P) => <svg {...base} {...p} fill="currentColor" stroke="none"><path d="M12 4.2c.5 0 .9.2 1.1.6l7.3 12.6c.5.9-.1 2-1.1 2H4.7c-1 0-1.6-1.1-1.1-2l7.3-12.6c.2-.4.6-.6 1.1-.6z" /></svg>;

/**
 * The brand mark: the orange triangle nailed to posts and trees all along New Zealand's tracks,
 * nail hole included.
 */
export const Marker = (p: P) => (
  <svg viewBox="0 0 32 32" aria-hidden="true" {...p}>
    <path d="M16 3.6c.95 0 1.8.5 2.28 1.32l11.1 19.3c.95 1.66-.25 3.73-2.17 3.73H4.79c-1.92 0-3.12-2.07-2.17-3.73l11.1-19.3A2.62 2.62 0 0116 3.6z" fill="#FF6B12" />
    <path d="M16 3.6c.95 0 1.8.5 2.28 1.32l2.1 3.66c-1.5-.5-2.9-.75-4.38-.75s-2.88.25-4.38.75l2.1-3.66A2.62 2.62 0 0116 3.6z" fill="#fff" opacity=".22" />
    <circle cx="16" cy="12.4" r="1.55" fill="#000" opacity=".3" />
  </svg>
);
