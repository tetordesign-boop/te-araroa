// BVH continuity checks over every frame: node render/check.mjs [--shots S04,S05] [--step 1]
import { open, arg } from "./lib.mjs";
import fs from "node:fs";
const shots = arg("shots") ? arg("shots").split(",") : undefined;
const { page, close } = await open({ verbose: false });
await page.evaluate(() => window.film.init("16x9"));
const report = await page.evaluate((o) => window.film.check(o), { shots, step: Number(arg("step", 1)) });
await close();
const by = {}; for (const r of report) { const k = `${r.shot} ${r.kind}`; (by[k] ??= []).push(r); }
fs.mkdirSync("out", { recursive: true }); fs.writeFileSync("out/check.json", JSON.stringify(report, null, 1));
if (!report.length) console.log("checks: all clear");
for (const [k, list] of Object.entries(by)) console.log(`${k}: ${list.length} frames (first ${list[0].frame}: ${list[0].msg})`);
