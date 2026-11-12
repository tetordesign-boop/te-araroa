// How costly is zooming out of the map? A phone-sized page (iPhone 13, the map drawn at 2 device pixels), a zoom-out
// from a valley (Arthur's Pass, zoom 12.5) to the whole island (zoom 5.4) in 3.5 s, as a pinch would do, measured with
// a Chrome trace: the busy time of the page's main thread (what makes a gesture stutter), of its workers (map tiles,
// relief, contours) and of the GPU process (here a software one: its time stands for the cost of drawing), plus the
// frames and the long tasks, and how long the map takes to settle afterwards.
// Each job compares the site as it is ("base") with one change ($CONFIG), alternately on the same machine, three times.
// Run in GitHub Actions (the development sandbox can't reach the map tiles): node zoomout.mjs <out dir>
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/bench";
const CONFIG = process.env.CONFIG || "mercator";
const ROUNDS = Number(process.env.ROUNDS || 3);
mkdirSync(OUT, { recursive: true });

// what each change does to the map (m), after the page has loaded (run inside the page)
function change(name) {
  const m = window.__tm.map;
  const hide = (re) => { for (const l of m.getStyle().layers) if (re(l)) m.setLayoutProperty(l.id, "visibility", "none"); };
  const C = {
    base: () => {},
    mercator: () => m.setProjection({ type: "mercator" }),
    noColorRelief: () => hide((l) => l.id === "color-relief"),
    noHillshade: () => hide((l) => l.id === "hillshade"),
    noLandcover: () => hide((l) => /^landcover-|^park-fill$|^park-line$/.test(l.id)),
    noPois: () => hide((l) => l.source === "pois" || l.source === "stations"),
    noTerrain: () => { m.setTerrain(null); m.setTerrain = () => m; },
    noBaseLabels: () => hide((l) => l.type === "symbol" && l.source === "ofm"),
    noContours: () => hide((l) => l.source === "contours"),
    fade0: () => { m._fadeDuration = 0; },
  };
  if (!C[name]) throw new Error(`unknown change ${name}`);
  C[name]();
}
const NAMES = ["base", "mercator", "noColorRelief", "noHillshade", "noLandcover", "noPois", "noTerrain", "noBaseLabels", "noContours", "fade0"];
if (!NAMES.includes(CONFIG)) throw new Error(`unknown CONFIG ${CONFIG}`);

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });

async function settle(p, ms) {
  return p.evaluate((ms) => new Promise((res) => {
    const m = window.__tm.map, t0 = performance.now();
    let done = false;
    const end = (ok) => { if (!done) { done = true; res({ ok, ms: Math.round(performance.now() - t0) }); } };
    m.once("idle", () => end(true));
    m.triggerRepaint();
    setTimeout(() => end(false), ms);
  }), ms);
}

async function run(name, record) {
  const p = await ctx.newPage();
  p.setDefaultTimeout(180_000);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:5173/?mock&before");
  await p.waitForTimeout(1500);
  if (await p.$(".intro")) { await p.keyboard.press("Enter"); }
  await p.waitForFunction(() => window.__tm?.map?.loaded?.(), null, { timeout: 120_000 });
  await settle(p, 60_000);
  // the change, then the start: a valley close up, everything loaded
  await p.evaluate(change, name);
  await p.evaluate(() => window.__tm.map.jumpTo({ center: [171.56, -42.94], zoom: 12.5, bearing: 0, pitch: 0 }));
  const before = await settle(p, 90_000);
  let trace = null;
  if (record) await browser.startTracing(p, { categories: ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline.frame"] });
  const move = await p.evaluate(() => new Promise((res) => {
    const m = window.__tm.map, frames = [], longs = [];
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); });
    try { po.observe({ type: "longtask", buffered: false }); } catch (_) { /* no long task timing */ }
    let raf = 0;
    const tick = (t) => { frames.push(t); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const t0 = performance.now();
    m.once("moveend", () => {
      const tEnd = performance.now();
      cancelAnimationFrame(raf);
      // after the gesture: how long until every tile is in and drawn
      const t1 = performance.now();
      let settled = false;
      const finish = (ok) => {
        if (settled) return; settled = true;
        po.disconnect();
        const d = frames.slice(1).map((t, i) => t - frames[i]);
        res({ moveMs: Math.round(tEnd - t0), frames: frames.length, gaps: d.map((x) => Math.round(x)), idleAfterMs: ok ? Math.round(performance.now() - t1) : null, longs });
      };
      m.once("idle", () => finish(true));
      setTimeout(() => finish(false), 30_000);
    });
    m.easeTo({ zoom: 5.4, duration: 3500, easing: (x) => x });
  }));
  if (record) trace = await browser.stopTracing();
  await p.close();
  return { name, before, move, trace, errors };
}

/** busy time by thread from a Chrome trace, in ms, during the zoom-out and the settling after it */
function busy(buf) {
  const { traceEvents: ev } = JSON.parse(buf.toString());
  const names = new Map();
  for (const e of ev) if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name);
  const sums = {};
  for (const e of ev) {
    if (e.ph !== "X" || !e.dur || !/toplevel/.test(e.cat)) continue;
    if (!/RunTask|ThreadPool_RunTask/.test(e.name)) continue;
    const n = names.get(`${e.pid}:${e.tid}`) || "?";
    const k = /CrRendererMain/.test(n) ? "main" : /DedicatedWorker/.test(n) ? "workers" : /CrGpuMain|VizCompositor|GpuMemory/.test(n) ? "gpu" : null;
    if (!k) continue;
    sums[k] = (sums[k] || 0) + e.dur / 1000;
  }
  for (const k of Object.keys(sums)) sums[k] = Math.round(sums[k]);
  return sums;
}

const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const rows = [];
console.log(`config ${CONFIG}: priming the caches`);
await run("base", false);
for (let r = 0; r < ROUNDS; r++) {
  for (const name of r % 2 ? [CONFIG, "base"] : ["base", CONFIG]) {
    const res = await run(name, true);
    const b = res.trace ? busy(res.trace) : {};
    const g = res.move.gaps;
    const row = {
      name, round: r, ...b,
      frames: res.move.frames, moveMs: res.move.moveMs,
      gapP50: pct(g, 0.5), gapP90: pct(g, 0.9), gapMax: g.length ? Math.max(...g) : null,
      longTasks: res.move.longs.length, longMs: res.move.longs.reduce((a, x) => a + x, 0),
      idleAfterMs: res.move.idleAfterMs, startIdle: res.before.ok, errors: res.errors.length,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
const avg = (name, k) => { const v = rows.filter((r) => r.name === name && typeof r[k] === "number").map((r) => r[k]); return v.length ? Math.round(v.reduce((a, x) => a + x, 0) / v.length) : null; };
const keys = ["main", "workers", "gpu", "frames", "gapP50", "gapP90", "gapMax", "longTasks", "longMs", "idleAfterMs"];
const summary = Object.fromEntries(keys.map((k) => [k, { base: avg("base", k), [CONFIG]: avg(CONFIG, k) }]));
console.log(`SUMMARY ${CONFIG} ${JSON.stringify(summary)}`);
writeFileSync(`${OUT}/bench-${CONFIG}.json`, JSON.stringify({ config: CONFIG, rows, summary }, null, 1));
await browser.close();
