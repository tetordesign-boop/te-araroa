// Kiwi department entry (same interface as the stand-in). Loads the real kiwi (main.js); if it fails to load or
// build, falls back to the stand-in so the other departments' previews keep working.
import standin from "./standin.js";
export default {
  async create(ctx) {
    try {
      const k = await (await import("./main.js")).default.create(ctx);
      const up = k.update; let warned = false;
      k.update = (...a) => { try { up(...a); } catch (e) { if (!warned) { console.log("[kiwi] update error: " + (e?.stack ?? e)); warned = true; } } };
      return k;
    } catch (e) {
      console.log("[kiwi] falling back to the stand-in: " + (e?.stack ?? e));
      return standin.create(ctx);
    }
  },
};
