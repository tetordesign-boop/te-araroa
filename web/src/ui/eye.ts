import { latestPosition, route } from "../lib/data";
import { bearing, type LngLat } from "../lib/geo";
import { trailElevation } from "../lib/places";
import { cameraShow, detent, isDesktop, mapApi, replayState, trailMode } from "./state";

/** The camera just behind Ewan, a little above him, looking where the trail takes him. */
export function startEyeView() {
  const tm = mapApi.value;
  const lp = latestPosition.value;
  if (!tm || !lp) return;
  replayState.value?.stop();
  trailMode.value = null;
  const at: LngLat = [lp.lng, lp.lat];
  const r = route.value;
  const snap = r.nearest(at);
  const ahead = r.pointAt(Math.min(r.total, snap.km + 1.2));
  // on the trail: its direction (south-bound); off it: towards where he'll rejoin it
  const brg = snap.dist < 400 ? r.bearingAt(snap.km, 0.8) : bearing(at, ahead);
  const ground = snap.dist < 400 ? trailElevation(snap.km) : lp.alt;
  if (!isDesktop.value) detent.value = "peek";
  cameraShow.value = { kind: "eye", stop: () => {} };
  // let the sheet settle first (it changes the map's padding), then fly
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (cameraShow.peek()?.kind !== "eye") return;
    const cancel = tm.eyeLevel(at, brg, ground ?? null);
    cameraShow.value = { kind: "eye", stop: cancel };
  }));
}

/** Back to the usual view over Ewan. */
export function endEyeView() {
  const tm = mapApi.value;
  const show = cameraShow.value;
  if (show?.kind !== "eye") return;
  show.stop();
  cameraShow.value = null;
  const lp = latestPosition.value;
  if (tm && lp) tm.flyTo([lp.lng, lp.lat], 11.6, 55);
}
