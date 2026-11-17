// Points of interest along the trail (built from OpenStreetMap by scripts/data/pois.mjs), with the iconic spots
// and film locations chosen by hand (scripts/data/curated.mjs), which carry a short text.
import type { Lang } from "../types";

export type PoiKind = "hut" | "camp" | "water" | "pass" | "peak" | "fall" | "view" | "icon" | "film" | "gap";

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
  /** water points: a spring (to treat), and whether the map says it is drinkable */
  spr?: 1;
  pot?: 0 | 1;
  /** places chosen by hand: the French name if it differs, a short text in each language, a page to read more,
   * the film (French, English), and what the map knew it as before (a pass that is also the trail's high point) */
  nfr?: string;
  fr?: string;
  en?: string;
  src?: string;
  film?: [string, string];
  was?: PoiKind;
}

/** Filter groups shown as chips; each kind belongs to one group. */
export type PoiGroup = "huts" | "camps" | "water" | "icons" | "films" | "summits" | "sights";
export const GROUP_OF: Record<PoiKind, PoiGroup | null> = {
  hut: "huts", camp: "camps", water: "water", pass: "summits", peak: "summits", fall: "sights", view: "sights", icon: "icons", film: "films", gap: null,
};
export const GROUPS: PoiGroup[] = ["huts", "camps", "water", "icons", "films", "summits", "sights"];

/**
 * Badge colour per kind. Dark: bright disks with a navy glyph on the night map (each checked against the others
 * for colour-vision deficiency by lightness and hue; the glyph always says the kind too).
 */
export const KIND_COLOR: Record<PoiKind, { light: string; dark: string }> = {
  hut: { light: "#5856D6", dark: "#8B80FF" },
  camp: { light: "#2E9D57", dark: "#56E39F" },
  pass: { light: "#C2367A", dark: "#FF3D9A" },
  peak: { light: "#3A3A3C", dark: "#EAF2FF" },
  fall: { light: "#0A84C8", dark: "#4CC3FF" },
  view: { light: "#0A84C8", dark: "#4CC3FF" },
  water: { light: "#1F63D6", dark: "#3E8BFF" },
  icon: { light: "#B88600", dark: "#FFD23F" },
  film: { light: "#D2433A", dark: "#FF7466" },
  gap: { light: "#8E8E93", dark: "#9AA8BE" },
};

const LABELS: Record<PoiKind, [string, string]> = {
  hut: ["Refuge", "Hut"], camp: ["Camping", "Campsite"], pass: ["Col", "Pass"], peak: ["Sommet", "Peak"],
  fall: ["Cascade", "Waterfall"], view: ["Point de vue", "Viewpoint"], gap: ["Transfert", "Transfer"],
  water: ["Point d'eau", "Water point"], icon: ["Lieu culte", "Iconic spot"], film: ["Décor de film", "Film location"],
};
const GROUP_LABELS: Record<PoiGroup, [string, string]> = {
  huts: ["Refuges", "Huts"], camps: ["Campings", "Campsites"], water: ["Points d'eau", "Water"], icons: ["Lieux cultes", "Iconic spots"],
  films: ["Terre du Milieu", "Middle-earth"], summits: ["Sommets et cols", "Peaks and passes"], sights: ["Cascades et vues", "Falls and views"],
};
export function kindLabel(p: Poi, l: Lang): string {
  const fr = l === "fr";
  if (p.t === "hut" && p.biv) return fr ? "Bivouac" : "Bivvy";
  if (p.t === "water") return p.spr ? (fr ? "Source" : "Spring") : p.pot === 1 ? (fr ? "Eau potable" : "Drinking water") : LABELS.water[fr ? 0 : 1];
  if (p.t === "film" && p.film) return fr ? `Décor · ${p.film[0]}` : `Film location · ${p.film[1]}`;
  return LABELS[p.t][fr ? 0 : 1];
}
/** The name in this language (a few film locations have a French one); a nameless tap is called by its kind. */
export const poiName = (p: Poi, l: Lang) => (l === "fr" && p.nfr) || p.n || kindLabel(p, l);
/** The short text of a place chosen by hand, in this language. */
export const poiText = (p: Poi, l: Lang) => (l === "fr" ? p.fr : p.en) ?? null;
export const groupLabel = (g: PoiGroup, l: Lang) => GROUP_LABELS[g][l === "fr" ? 0 : 1];

/** Map priority: what wins when labels collide (lower first). */
export const PRIORITY: Record<PoiKind, number> = { gap: 0, icon: 1, film: 2, hut: 3, pass: 4, camp: 5, peak: 6, water: 7, fall: 8, view: 9 };

/** Fold accents and macrons so "wanaka" finds "Wānaka". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
