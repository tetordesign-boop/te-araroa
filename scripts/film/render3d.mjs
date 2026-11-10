// Renders the film's 3D flight (web/film3d.html) frame by frame, with the real tiles (run in GitHub Actions: the
// development sandbox can't reach them). scripts/film/mode.txt: "stills 10.2 13 …" for a few checks, or "full".
// Out: flight.mp4 (1080×1920, 60 fps, 10 → 17.5 s of the film) and flight.json (where the point and towns land).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2] || "/tmp/film"; mkdirSync(OUT, { recursive: true });
const [mode, ...args] = readFileSync(new URL("./mode.txt", import.meta.url), "utf8").trim().split(/\s+/);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text().slice(0, 200)));
await page.goto("http://localhost:5173/film3d.html", { waitUntil: "load" });
await page.waitForFunction(() => typeof window.frame === "function", null, { timeout: 60000 });
const t0 = Date.now();
if (mode === "stills") {
  const info = [];
  for (const a of args) { const r = await page.evaluate((t) => window.frame(t), +a); info.push(r); await page.screenshot({ path: `${OUT}/still-${(+a).toFixed(2)}.jpg`, type: "jpeg", quality: 90 }); console.log("still", a, JSON.stringify(r)); }
  writeFileSync(`${OUT}/stills.json`, JSON.stringify(info, null, 1));
} else {
  const FPS = 60, A = 10.0, B = 17.5, n = Math.round((B - A) * FPS);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", String(FPS), `${OUT}/flight.mp4`], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("exit", (c) => (c === 0 ? res() : rej(new Error("ffmpeg " + c)))));
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = A + i / FPS;
    frames.push(await page.evaluate((t) => window.frame(t), t));
    const buf = await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 30 === 0) console.log(`frame ${i}/${n} at ${t.toFixed(2)} s, ${((Date.now() - t0) / 1000).toFixed(0)} s so far`);
  }
  ff.stdin.end(); await done;
  writeFileSync(`${OUT}/flight.json`, JSON.stringify({ fps: FPS, start: A, frames }));
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
