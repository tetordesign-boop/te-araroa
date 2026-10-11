// Map icons drawn at runtime (no sprite file): round badges with a white glyph, like Apple Maps POIs.
import type { Map as MLMap } from "maplibre-gl";
import { KIND_COLOR, type PoiKind } from "./pois";

export const GLYPHS: Record<Exclude<PoiKind, "peak">, string> = {
  hut: '<path d="M5.2 11.4 12 5.3l6.8 6.1V18.6a.9.9 0 0 1-.9.9h-3.6v-4.8H9.7v4.8H6.1a.9.9 0 0 1-.9-.9z"/>',
  camp: '<path fill-rule="evenodd" d="M12 4.6 3.8 19.2h16.4zm0 6.1 3.4 8.5H8.6z"/>',
  pass: '<path d="M2.8 18.6 8.3 9.4l3 4.1 2-2.9 7.9 8z"/>',
  fall: '<path d="M12 3.8c3 4.1 5.4 7.2 5.4 10.1a5.4 5.4 0 0 1-10.8 0C6.6 11 9 7.9 12 3.8z"/>',
  view: '<path fill-rule="evenodd" d="M2.6 12S6 6.2 12 6.2 21.4 12 21.4 12 18 17.8 12 17.8 2.6 12 2.6 12zm9.4 3.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z"/>',
  gap: '<path fill-rule="evenodd" d="M6.2 4.8h11.6A2.2 2.2 0 0 1 20 7v8.6a2 2 0 0 1-1.6 2v1.6h-2.5v-1.5H8.1v1.5H5.6v-1.6A2 2 0 0 1 4 15.6V7a2.2 2.2 0 0 1 2.2-2.2zm.3 2.6v4.4h11V7.4zm.6 6.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm9.8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/>',
};

/** Glyphs for the badges in the interface (the map draws peaks as small triangles and towns as stations). */
export const BADGE_GLYPHS: Record<PoiKind | "town", string> = {
  ...GLYPHS,
  peak: '<path d="M12 4.6 20.6 19.2H3.4z"/>',
  town: '<path d="M11 3.6h2v2.6h4.6l2.6 2.7-2.6 2.7H13v8.8h-2v-8.8H5.4V6.2H11z"/>',
};

function badge(color: string, glyph: string, dark: boolean, size: number) {
  const ring = dark ? "rgba(0,0,0,0.55)" : "#ffffff";
  const r = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 8}" height="${size + 8}" viewBox="${-4} ${-4} ${size + 8} ${size + 8}">
    <defs><filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="${dark ? 0.6 : 0.28}"/></filter></defs>
    <circle cx="${r}" cy="${r}" r="${r - 0.5}" fill="${color}" stroke="${ring}" stroke-width="2" filter="url(#s)"/>
    <g transform="translate(${r - size * 0.32} ${r - size * 0.32}) scale(${(size * 0.64) / 24})" fill="#fff">${glyph}</g>
  </svg>`;
}

const peak = (dark: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" viewBox="0 0 14 13">
  <path d="M7 1.4 12.8 11.6H1.2z" fill="${dark ? "#e5e5ea" : "#3a3a3c"}" stroke="${dark ? "rgba(0,0,0,0.6)" : "#fff"}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

const station = (dark: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="5.6" fill="${dark ? "#1c1c1e" : "#fff"}" stroke="${dark ? "#f2f2f7" : "#1c1c1e"}" stroke-width="2.4"/></svg>`;

const ring = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="19" fill="rgba(255,107,18,0.16)" stroke="#FF6B12" stroke-width="3"/></svg>`;

const cache = new Map<string, Promise<ImageData>>();
function raster(svg: string, scale = 2): Promise<ImageData> {
  const hit = cache.get(svg);
  if (hit) return hit;
  const p = new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.ceil(img.width * scale), h = Math.ceil(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  cache.set(svg, p);
  return p;
}

/** Register every icon the overlays use (call after each style load: setStyle wipes images). */
export async function installIcons(map: MLMap, dark: boolean) {
  const jobs: Promise<void>[] = [];
  const add = (name: string, svg: string) => jobs.push(raster(svg).then((img) => {
    if (map.hasImage(name)) map.updateImage(name, img); else map.addImage(name, img, { pixelRatio: 2 });
  }).catch(() => {}));
  for (const k of Object.keys(GLYPHS) as Exclude<PoiKind, "peak">[]) {
    const color = KIND_COLOR[k][dark ? "dark" : "light"];
    add(`poi-${k}`, badge(color, GLYPHS[k], dark, 22));
    add(`poi-${k}-big`, badge(color, GLYPHS[k], dark, 32));
  }
  add("poi-peak", peak(dark));
  add("poi-peak-big", peak(dark));
  add("station", station(dark));
  add("poi-ring", ring);
  await Promise.all(jobs);
}
