// Final render. One encoded file per shot and aspect (same size, fps and encoder settings), joined with the concat
// demuxer (-c copy), then the score added with -c:v copy. Resumable: finished shot files are kept.
//   node render/render.mjs [--aspects 16x9,9x16] [--langs fr,en] [--shots S01,S02] [--force] [--crf 15]
import { open, arg, ROOT } from "./lib.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";

const FPS = 24;
const aspects = arg("aspects", "16x9,9x16").split(","), langs = arg("langs", "fr,en").split(",");
const only = arg("shots") ? arg("shots").split(",") : null, force = process.argv.includes("--force");
const crf = arg("crf", "16");
const dir = `${ROOT}/out/shots`; fs.mkdirSync(dir, { recursive: true });

function encoder(file) {
  const tmp = file.replace(/\.mp4$/, ".part.mp4");
  const p = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", crf, "-tune", "film", "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", "48", "-bf", "2", tmp], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => p.on("exit", (code) => { if (code === 0) { fs.renameSync(tmp, file); res(); } else rej(new Error(`ffmpeg ${code} for ${file}`)); }));
  return { write: (buf) => new Promise((res) => (p.stdin.write(buf) ? res() : p.stdin.once("drain", res))), end: () => { p.stdin.end(); return done; } };
}

const { page, close } = await open({ verbose: true });
const shots = await page.evaluate(() => window.film.shots());
const t0 = Date.now(); let frames = 0;
for (const s of shots) {
  if (only && !only.includes(s.id)) continue;
  const isTitle = s.id === shots[shots.length - 1].id;
  for (const asp of aspects) for (const lang of isTitle ? langs : ["xx"]) {
    const file = `${dir}/${s.id}-${asp}${isTitle ? "-" + lang : ""}.mp4`;
    if (!force && fs.existsSync(file)) { console.log("keep", file); continue; }
    await page.evaluate(([a, l]) => window.film.init(a, l), [asp, lang === "xx" ? "fr" : lang]);
    const enc = encoder(file); const ts = Date.now();
    for (let f = s.f0; f < s.f1; f++) {
      const r = await page.evaluate((t) => window.film.frame(t, 0.95), f / FPS);
      await enc.write(Buffer.from(r.url.split(",")[1], "base64")); frames++;
    }
    await enc.end();
    console.log(`${s.id} ${asp} ${lang} ${s.f1 - s.f0} frames in ${((Date.now() - ts) / 1000).toFixed(0)} s (total ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  }
}
await close();

// join + sound
const score = `${ROOT}/sound/score.wav`;
fs.mkdirSync(`${ROOT}/out/final`, { recursive: true });
for (const asp of aspects) for (const lang of langs) {
  const list = shots.map((s, i) => `${dir}/${s.id}-${asp}${i === shots.length - 1 ? "-" + lang : ""}.mp4`);
  if (!list.every((f) => fs.existsSync(f))) { console.log(`skip join ${asp} ${lang}: missing shots`); continue; }
  const txt = `${ROOT}/out/final/list-${asp}-${lang}.txt`; fs.writeFileSync(txt, list.map((f) => `file '${f}'`).join("\n"));
  const silent = `${ROOT}/out/final/kiwi-${lang}-${asp}.video.mp4`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", txt, "-c", "copy", silent.replace(/\.mp4$/, ".part.mp4")]); fs.renameSync(silent.replace(/\.mp4$/, ".part.mp4"), silent);
  if (fs.existsSync(score)) {
    const out = `${ROOT}/out/final/kiwi-${lang}-${asp}.mp4`, tmp = out.replace(/\.mp4$/, ".part.mp4");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", score, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", tmp]);
    fs.renameSync(tmp, out); console.log("final", out);
  } else console.log("no score yet:", silent);
}
console.log(`done: ${frames} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
