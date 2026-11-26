// Page entry: window.film is driven by render/*.mjs through Playwright.
import { Stage, ASPECTS } from "./stage.js";
import { SHOTS } from "../shots.js";
import { FPS } from "./time.js";
import { runChecks } from "./check.js";

const canvas = document.getElementById("c");
const stage = new Stage(canvas);
window.film = {
  shots: () => SHOTS.map((s) => ({ id: s.id, t0: s.t0, t1: s.t1, f0: Math.round(s.t0 * FPS), f1: Math.round(s.t1 * FPS), env: s.env })),
  init(aspect = "16x9", lang = "fr") { stage.setAspect(aspect); stage.lang = lang; return ASPECTS[aspect]; },
  /** Render the frame at time t (seconds). Returns a JPEG data URL (or PNG if q <= 0). */
  async frame(t, q = 0.95) {
    const t0 = performance.now();
    await stage.render(t);
    const gl = stage.renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = performance.now() - t0;
    return { url: q > 0 ? canvas.toDataURL("image/jpeg", q) : canvas.toDataURL("image/png"), ms };
  },
  async check(opts = {}) { return runChecks(stage, opts); },
  stage,
};
window.filmReady = true;
