import type { JSX } from "preact";

type P = JSX.SVGAttributes<SVGSVGElement>;
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": true } as const;

export const ChevronLeft = (p: P) => <svg {...base} {...p}><path d="M15 5l-7 7 7 7" /></svg>;
export const ChevronRight = (p: P) => <svg {...base} {...p}><path d="M9 5l7 7-7 7" /></svg>;
export const ChevronUp = (p: P) => <svg {...base} {...p}><path d="M5 15l7-7 7 7" /></svg>;
export const Close = (p: P) => <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const Share = (p: P) => <svg {...base} {...p}><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" /><path d="M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1" /></svg>;
export const Locate = (p: P) => <svg {...base} {...p} fill="currentColor" stroke="none"><path d="M20.6 3.4a.9.9 0 00-1-.2L3.9 9.6a.9.9 0 00.1 1.7l6.6 2.1 2.1 6.6a.9.9 0 001.7.1l6.4-15.7a.9.9 0 00-.2-1z" /></svg>;
export const Layers = (p: P) => <svg {...base} {...p}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>;
export const Mountain = (p: P) => <svg {...base} {...p}><path d="M3 19l6.5-11 4 6.5 2.5-4L21 19H3z" /></svg>;
export const Play = (p: P) => <svg {...base} {...p} fill="currentColor" stroke="none"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.8l11-7.2a1 1 0 000-1.6l-11-7.2C7.9 3.5 7 4 7 4.8z" /></svg>;
export const Replay = (p: P) => <svg {...base} {...p}><path d="M3 20l5.5-9 3.5 5 2.5-3.5L21 20" /><circle cx="17" cy="5.5" r="2.2" fill="currentColor" stroke="none" /></svg>;
export const Globe = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>;

/** The brand mark: an orange track marker, as nailed to posts all over New Zealand's backcountry. */
export const Marker = (p: P) => (
  <svg viewBox="0 0 32 32" aria-hidden="true" {...p}>
    <circle cx="16" cy="16" r="16" fill="var(--glass-solid)" />
    <path d="M16 7.2c.6 0 1.1.3 1.4.8l7.2 12.6c.6 1.1-.2 2.4-1.4 2.4H8.8c-1.2 0-2-1.3-1.4-2.4L14.6 8c.3-.5.8-.8 1.4-.8z" fill="#FF6B12" />
  </svg>
);
