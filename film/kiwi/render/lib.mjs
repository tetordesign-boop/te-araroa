// Shared: static server + headless Chromium (SwiftShader WebGL2) with the film page loaded.
import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
export const ROOT = "/home/claude/anime";
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg" };
export async function open({ port = 8700 + Math.floor(Math.random() * 200), verbose = true } = {}) {
  const srv = http.createServer((q, r) => {
    const p = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": TYPES[path.extname(p)] ?? "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(p).pipe(r);
  });
  await new Promise((res) => srv.listen(port, res));
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-driver-bug-workarounds"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("console", (m) => { const s = m.text(); if (verbose && !/GPU stall|GL Driver Message/.test(s)) console.log("[page]", s); });
  page.on("pageerror", (e) => console.log("[page error]", e.message));
  await page.goto(`http://localhost:${port}/render/page.html`);
  await page.waitForFunction(() => window.filmReady === true, null, { timeout: 60000 });
  return { page, close: async () => { await browser.close(); srv.close(); } };
}
export function arg(name, def) { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; }
export function saveDataUrl(url, file) { fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64")); }
