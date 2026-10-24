// The brand image, "Le sentier, la nuit" (scripts/brand/scene.mjs), rendered where it is used:
//   web/public/icons   the app icons (night), the Carnet's (dusk), the maskable icon, the favicons;
//   web/src/brand      the site's own copies, in WebP: the round logo of the brand pill (his back and pack), the
//                      app-icon tile of the presentation, the Carnet's tile, the whole scene for "À propos".
// Usage (from the repo root): node scripts/brand/icons.mjs   (needs playwright-core and a Chromium; see README)
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sceneSvg } from "./scene.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const OUT = [
  // [file, variant, crop, size, type, quality, corner radius (the favicons; the systems round the app icons)]
  ["web/public/icons/icon-512.png", "night", "tile", 512, "png"],
  ["web/public/icons/icon-192.png", "night", "tile", 192, "png"],
  ["web/public/icons/apple-touch-icon.png", "night", "tile", 180, "png"],
  ["web/public/icons/icon-maskable-512.png", "night", "mask", 512, "png"],
  ["web/public/icons/carnet-512.png", "dusk", "tile", 512, "png"],
  ["web/public/icons/carnet-192.png", "dusk", "tile", 192, "png"],
  ["web/public/icons/carnet-180.png", "dusk", "tile", 180, "png"],
  ["web/public/icons/favicon.png", "night", "face", 64, "png", 1, 14],
  ["web/public/icons/favicon-carnet.png", "dusk", "face", 64, "png", 1, 14],
  ["web/src/brand/scene-face.webp", "night", "face", 128, "webp", 0.86],
  ["web/src/brand/scene-tile.webp", "night", "tile", 288, "webp", 0.86],
  ["web/src/brand/scene-tile-dusk.webp", "dusk", "tile", 256, "webp", 0.86],
  ["web/src/brand/scene.webp", "night", "full", 1080, "webp", 0.82],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
for (const [file, variant, crop, size, type, quality, round = 0] of OUT) {
  const svg = sceneSvg({ variant, crop, size, grain: type === "webp" });
  // drawn through a canvas, which writes PNG and WebP alike
  const data = await page.evaluate(async ({ svg, size, type, quality, round }) => {
    const img = new Image();
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    if (round) { g.beginPath(); g.roundRect(0, 0, size, size, round); g.clip(); }
    g.drawImage(img, 0, 0, size, size);
    return c.toDataURL(`image/${type}`, quality).split(",")[1];
  }, { svg, size, type, quality, round });
  writeFileSync(`${ROOT}/${file}`, Buffer.from(data, "base64"));
  console.log(file, Math.round((data.length * 3) / 4 / 1024) + " KB");
}
await browser.close();

// the app icons in 256 colours, dithered (Pillow): about a quarter of the size, the same to the eye
const opaque = OUT.filter(([, , , , type, , round]) => type === "png" && !round).map(([f]) => `${ROOT}/${f}`);
try {
  execFileSync("python3", ["-c", [
    "import sys",
    "from PIL import Image",
    "for p in sys.argv[1:]:",
    "    Image.open(p).convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(p, optimize=True)",
  ].join("\n"), ...opaque], { stdio: "inherit" });
  console.log("app icons quantised");
} catch { console.log("(no python3 with Pillow: the app icons are left as Chromium wrote them)"); }
