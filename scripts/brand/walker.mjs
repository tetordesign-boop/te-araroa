// The mark, "Le marcheur", as SVG for the scripts (app icons, favicon, link preview): Ewan seen from behind,
// the way everyone who follows him sees him. The same drawing as BrandMark in web/src/ui/icons.tsx, from the same
// geometry, web/src/brand/walker.json (a 100 x 100 square).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const W = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../web/src/brand/walker.json"), "utf8"));

/**
 * compact: the drawing for 16 to 40 px (favicon, brand pill): arms and legs a little bolder, no seam on the pack.
 * carnet: the reverse, for the Carnet's icon on marker orange (navy figure, white pack).
 */
export function walker({ compact = false, carnet = false } = {}) {
  const c = carnet ? { ...W.colors, ...W.colors.carnet } : W.colors;
  const w = compact ? W.compact : W.width;
  const [hx, hy, hr] = W.head, [mx, my, mw, mh, mr] = W.mat, [px, py, pw, ph, pr] = W.pack;
  return `<g stroke="${c.ink}" stroke-linecap="round" fill="none"><path d="${W.arms}" stroke-width="${w.arm}"/><path d="${W.legStand}" stroke-width="${w.leg}"/><path d="${W.legStep}" stroke-width="${w.leg}"/></g>`
    + `<circle cx="${hx}" cy="${hy}" r="${hr}" fill="${c.ink}"/>`
    + `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${pr}" fill="${c.pack}"/>`
    + (compact ? "" : `<path d="${W.seam}" stroke="${c.seam}" stroke-width="${W.width.seam}" stroke-linecap="round"/>`)
    + `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="${mr}" fill="${c.mat}"/>`;
}
