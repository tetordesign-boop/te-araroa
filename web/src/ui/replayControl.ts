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
  let ended = false;
  replayState.value = { n: d.day_number, progress: 0, stop: () => {} };
  const stop = replayDay(tm, route.value, d,
    (f) => { if (replayState.value) replayState.value = { ...replayState.value, progress: f }; },
    () => {
      ended = true;
      replayState.value = null;
      if (!isDesktop.value) detent.value = before === "peek" ? "half" : before;
      tm.flyToDay(d, route.value);
    });
  // a day with nothing to fly over ends at once: never leave the progress bar behind
  if (!ended && replayState.value) replayState.value = { ...replayState.value, stop };
}
