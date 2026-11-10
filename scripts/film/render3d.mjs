// Renders the film's 3D flight (web/film3d.html) frame by frame, with the real tiles (run in GitHub Actions: the
// development sandbox can't reach them). scripts/film/mode.txt: "stills 10.2 13 …" for a few checks, or "full".
// A frame takes half a minute on a runner without a GPU: the full flight is split across jobs (SHARD of SHARDS),
// each writing its JPEG frames and where the point and towns land; the last job joins them.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2] || "/tmp/film"; mkdirSync(OUT, { recursive: true });
const [mode, ...args] = readFileSync(new URL("./mode.txt", import.meta.url), "utf8").trim().split(/\s+/);
const SHARD = +(process.env.SHARD ?? 0), SHARDS = +(process.env.SHARDS ?? 1);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text().slice(0, 200)));
await page.goto("http://localhost:5173/film3d.html", { waitUntil: "load" });
await page.waitForFunction(() => typeof window.frame === "function", null, { timeout: 120000 });
const t0 = Date.now();
const grab = async (path) => { const url = await page.evaluate(() => window.capture()); writeFileSync(path, Buffer.from(url.split(",")[1], "base64")); };
if (mode === "stills") {
  const info = [];
  for (const a of args) { const r = await page.evaluate((t) => window.frame(t), +a); info.push(r); await grab(`${OUT}/still-${(+a).toFixed(2)}.jpg`); console.log("still", a, `${((Date.now() - t0) / 1000).toFixed(0)} s`, JSON.stringify(r)); }
  writeFileSync(`${OUT}/stills.json`, JSON.stringify(info, null, 1));
} else {
  const FPS = 60, A = 10.0, B = 17.5, n = Math.round((B - A) * FPS);
  const from = Math.floor((SHARD * n) / SHARDS), to = Math.floor(((SHARD + 1) * n) / SHARDS);
  const frames = [];
  for (let i = from; i < to; i++) {
    const t = A + i / FPS;
    frames.push({ i, ...(await page.evaluate((t) => window.frame(t), t)) });
    await grab(`${OUT}/f${String(i).padStart(4, "0")}.jpg`);
    console.log(`frame ${i} (${i - from + 1}/${to - from}) at ${t.toFixed(3)} s, ${((Date.now() - t0) / 1000).toFixed(0)} s so far`);
  }
  writeFileSync(`${OUT}/part-${String(SHARD).padStart(2, "0")}.json`, JSON.stringify(frames));
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
