// Points of interest along the trail (built from OpenStreetMap by scripts/data/pois.mjs).
import type { Lang } from "../types";

export type PoiKind = "hut" | "camp" | "pass" | "peak" | "fall" | "view" | "gap";

export interface Poi {
  id: string;
  t: PoiKind;
  n: string;
  c: [number, number];
  e: number | null;
  /** km on the trail of the nearest point, and distance from the trail in metres */
  km: number;
  d: number;
  cap?: number;
  op?: string;
  url?: string;
  fee?: 0 | 1;
  book?: 1;
  water?: 1;
  wc?: 1;
  biv?: 1;
  /** transfers only: the length of the gap in metres */
  gap?: number;
}

/** Filter groups shown as chips; each kind belongs to one group. */
export type PoiGroup = "huts" | "camps" | "summits" | "sights";
export const GROUP_OF: Record<PoiKind, PoiGroup | null> = {
  hut: "huts", camp: "camps", pass: "summits", peak: "summits", fall: "sights", view: "sights", gap: null,
};
export const GROUPS: PoiGroup[] = ["huts", "camps", "summits", "sights"];

/** Badge colour per kind, light and dark (validated for colour-vision deficiency; glyphs carry identity too). */
export const KIND_COLOR: Record<PoiKind, { light: string; dark: string }> = {
  hut: { light: "#5856D6", dark: "#7471F0" },
  camp: { light: "#2E9D57", dark: "#34A85F" },
  pass: { light: "#C2367A", dark: "#D9488F" },
  peak: { light: "#3A3A3C", dark: "#E5E5EA" },
  fall: { light: "#0A84C8", dark: "#2F98DC" },
  view: { light: "#0A84C8", dark: "#2F98DC" },
  gap: { light: "#8E8E93", dark: "#98989D" },
};

const LABELS: Record<PoiKind, [string, string]> = {
  hut: ["Refuge", "Hut"], camp: ["Camping", "Campsite"], pass: ["Col", "Pass"], peak: ["Sommet", "Peak"],
  fall: ["Cascade", "Waterfall"], view: ["Point de vue", "Viewpoint"], gap: ["Transfert", "Transfer"],
};
const GROUP_LABELS: Record<PoiGroup, [string, string]> = {
  huts: ["Refuges", "Huts"], camps: ["Campings", "Campsites"], summits: ["Sommets et cols", "Peaks and passes"], sights: ["Cascades et vues", "Falls and views"],
};
export const kindLabel = (p: Poi, l: Lang) => (p.t === "hut" && p.biv ? (l === "fr" ? "Bivouac" : "Bivvy") : LABELS[p.t][l === "fr" ? 0 : 1]);
export const groupLabel = (g: PoiGroup, l: Lang) => GROUP_LABELS[g][l === "fr" ? 0 : 1];

/** Map priority: what wins when labels collide (lower first). */
export const PRIORITY: Record<PoiKind, number> = { gap: 0, hut: 1, pass: 2, camp: 3, peak: 4, fall: 5, view: 6 };

/** Fold accents and macrons so "wanaka" finds "Wānaka". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
