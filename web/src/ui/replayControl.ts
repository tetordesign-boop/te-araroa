import { route } from "../lib/data";
import { replayDay } from "../map/replay";
import type { Day } from "../types";
import { detent, isDesktop, mapApi, replayState } from "./state";

export function startReplay(d: Day) {
  const tm = mapApi.value;
  if (!tm) return;
  replayState.value?.stop();
  const before = detent.value;
  if (!isDesktop.value) detent.value = "peek";
  const stop = replayDay(tm, route.value, d,
    (f) => { if (replayState.value) replayState.value = { ...replayState.value, progress: f }; },
    () => {
      replayState.value = null;
      if (!isDesktop.value) detent.value = before === "peek" ? "half" : before;
      tm.flyToDay(d, route.value);
    });
  replayState.value = { n: d.day_number, progress: 0, stop };
}
