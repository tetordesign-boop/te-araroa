// The brand: "TA", the trail's initials, very heavy and very wide, and the orange point that is Ewan (the same one
// that shows him on the map). Type only, no picture. The site's own copy is ui/icons.tsx `Mark` (in CSS); this one
// draws the files: the app icons and favicons (icons.mjs) and the link preview (og.mjs).
// The Carnet's icon is the same mark turned round: dark letters on Ewan's orange, so the two sit apart on a phone.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const WEB = `${ROOT}/web`;
export const C = { night: "#0C1526", deep: "#0A1426", ink: "#F3F6FB", ink2: "#A9B6CC", marker: "#FF6B12", hot: "#FF8B3D" };
const VARIANT = {
  site: { bg: C.night, fg: C.ink, dot: C.marker },
  carnet: { bg: C.marker, fg: C.night, dot: C.night },
};

const font = (f) => `file://${WEB}/node_modules/@fontsource-variable/${f}`;
export const FONTS = `
@font-face { font-family: A; src: url(${font("archivo/files/archivo-latin-wdth-normal.woff2")}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: A; src: url(${font("archivo/files/archivo-latin-ext-wdth-normal.woff2")}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; unicode-range: U+0100-02BA; }
@font-face { font-family: F; src: url(file://${WEB}/src/fonts/fine-space.woff2) format("woff2"); unicode-range: U+202F; }
@font-face { font-family: L; src: url(${font("literata/files/literata-latin-opsz-normal.woff2")}) format("woff2"); font-weight: 200 900; }`;

/**
 * The mark on a square of `size` px. `scale`: the letters' size as a share of the square (smaller in a maskable icon,
 * whose edges a phone may crop); `radius`: rounded corners (the favicons; the phones round the app icons themselves).
 */
export function markHtml({ size, variant = "site", scale = 0.4, radius = 0, id = "" }) {
  const v = VARIANT[variant];
  const em = size * scale;
  return `<div${id ? ` id="${id}"` : ""} style="width:${size}px;height:${size}px;border-radius:${radius}px;background:${v.bg};display:flex;align-items:center;justify-content:center;overflow:hidden">`
    + `<span style="font:900 ${em}px/1 A;font-stretch:125%;letter-spacing:-0.06em;color:${v.fg}">TA</span>`
    + `<i style="display:block;flex:none;width:${em * 0.25}px;height:${em * 0.25}px;border-radius:50%;background:${v.dot};margin:${em * 0.5}px 0 0 ${em * 0.1}px"></i>`
    + `</div>`;
}
