// Draw a few frames at full size to look at.
//   node render/preview.mjs --times 12.0,12.5 [--aspect 16x9|9x16|both] [--lang fr] [--out out/preview] [--tag name]
//   node render/preview.mjs --shot S04 --at 0,0.5,0.95       (fractions of the shot)
import { open, arg, saveDataUrl } from "./lib.mjs";
import fs from "node:fs";
const out = arg("out", "out/preview"); fs.mkdirSync(out, { recursive: true });
const aspects = (arg("aspect", "16x9") === "both") ? ["16x9", "9x16"] : [arg("aspect", "16x9")];
const lang = arg("lang", "fr"), tag = arg("tag", "");
const { page, close } = await open();
let times = (arg("times", "") || "").split(",").filter(Boolean).map(Number);
if (arg("shot")) {
  const shots = await page.evaluate(() => window.film.shots());
  const s = shots.find((x) => x.id === arg("shot")); if (!s) throw new Error("no shot " + arg("shot"));
  times = arg("at", "0,0.5,0.95").split(",").map((f) => s.t0 + Number(f) * (s.t1 - s.t0));
}
for (const asp of aspects) {
  await page.evaluate(([a, l]) => window.film.init(a, l), [asp, lang]);
  for (const t of times) {
    const r = await page.evaluate((tt) => window.film.frame(tt, 0.93), t);
    const f = `${out}/${tag ? tag + "-" : ""}${asp}-${t.toFixed(3)}.jpg`; saveDataUrl(r.url, f);
    console.log(f, `${Math.round(r.ms)} ms`);
  }
}
await close();
