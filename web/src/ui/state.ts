import { signal } from "@preact/signals";
import type { TrailMap } from "../map/map";

export type View =
  | { name: "home" }
  | { name: "journal" }
  | { name: "day"; n: number; photo?: string }
  | { name: "place"; id: string }
  | { name: "explore" }
  | { name: "stats" }
  | { name: "about" };

export type Detent = "peek" | "half" | "full";

function parse(hash: string): View {
  const h = hash.replace(/^#\/?/, "");
  const [a, b, c] = h.split("/");
  if (a === "journal" || a === "voyage" || a === "journey") return { name: "journal" }; // (the photo voyage opens over the journal)
  if ((a === "jour" || a === "day") && b && /^\d+$/.test(b)) return { name: "day", n: parseInt(b, 10), photo: c || undefined };
  if ((a === "lieu" || a === "place") && b) return { name: "place", id: decodeURIComponent(b) };
  if (a === "explorer" || a === "explore") return { name: "explore" };
  if (a === "stats") return { name: "stats" };
  if (a === "apropos" || a === "about") return { name: "about" };
  return { name: "home" };
}

const detentFor = (v: View, desktop: boolean): Detent =>
  v.name === "home" ? "peek" : v.name === "day" || v.name === "place" ? (desktop ? "full" : "half") : "full";

/** The floating panel beside the map instead of the sheet: computers and big tablets, and phones held sideways
 * (a sheet would cover the whole of a screen that short). Same query as the `@media` rules in app.css. */
export const PANEL_MQ = "(min-width: 900px), (min-width: 600px) and (max-height: 520px)";
const panelMq = window.matchMedia(PANEL_MQ);
export const isDesktop = signal(panelMq.matches);
panelMq.addEventListener("change", (e) => (isDesktop.value = e.matches));

export const view = signal<View>(parse(location.hash));
export const detent = signal<Detent>(detentFor(view.value, isDesktop.value));
export const toastMsg = signal<string | null>(null);
export const replayState = signal<{ n: number; progress: number; stop: (byHand?: boolean) => void } | null>(null);
export const mapApi = signal<TrailMap | null>(null);
/** the map couldn't start (no WebGL 2: an older iPad, say): the trail is drawn plainly instead */
export const mapFailed = signal(false);
/** what the search field in the explore view holds (kept while browsing places) */
export const searchQuery = signal("");
/** the map's bearing, for the compass */
export const mapBearing = signal(0);
/** a camera show in progress (orbit around a place, Ewan's eye view): what it is, and how to stop it */
export const cameraShow = signal<{ kind: "orbit" | "eye"; id?: string; stop: () => void } | null>(null);
/** the whole-trail flyover with its elevation profile */
export const trailMode = signal<{ startKm: number } | null>(null);
/** the arrival, while the walked trail draws itself on the map: 0 to 1 (eased), null once it's all there */
export const arrival = signal<number | null>(null);
/** the arrival is still to play (once per visit, and again after the presentation is replayed) */
export const arrivalDue = signal(true);

// ------------------------------------------------------------------ the presentation, on a first visit
const INTRO_KEY = "intro-v1";
function firstVisit(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has("intro")) return true; // to look at it again (and for the screenshots)
  if (q.has("nointro")) return false;
  // a shared link to a day, a place or the flyover goes straight to it
  if (!/^#?\/?$/.test(location.hash)) return false;
  try { return !localStorage.getItem(INTRO_KEY); } catch (_) { return false; }
}
/** the presentation over the map: only on a first visit to the plain address (and when asked for again) */
export const introOpen = signal(firstVisit());
// before the first paint: the sheet and the controls wait off screen instead of sliding away
if (introOpen.peek()) document.documentElement.classList.add("is-intro");
export function rememberIntro() {
  try { localStorage.setItem(INTRO_KEY, "1"); } catch (_) { /* private mode: it will show again, that's all */ }
}

export function hrefFor(v: View): string {
  switch (v.name) {
    case "home": return "#/";
    case "journal": return "#/journal";
    case "day": return `#/jour/${v.n}${v.photo ? `/${v.photo}` : ""}`;
    case "place": return `#/lieu/${encodeURIComponent(v.id)}`;
    case "explore": return "#/explorer";
    case "stats": return "#/stats";
    case "about": return "#/apropos";
  }
}

let depth = 0;

/** The flyover has its own address (#/survol), so the back gesture closes it and a link can open it. */
export const FLYOVER_RE = /^#\/(?:survol|flyover)(?:\/(\d+(?:\.\d+)?))?\/?$/;
export function pushFlyoverHash(km: number) {
  if (FLYOVER_RE.test(location.hash)) return;
  history.pushState(null, "", `#/survol/${Math.round(km)}`);
  depth++;
}
export function closeTrailMode() {
  if (!trailMode.value) return;
  if (FLYOVER_RE.test(location.hash)) {
    if (depth > 0) { history.back(); return; } // the popstate below ends the mode
    history.replaceState(null, "", hrefFor(view.value));
  }
  trailMode.value = null;
}

/** "Le voyage en photos" over the journal (ui/PhotoTunnel.tsx): it has its own address, so the back gesture closes it. */
export const VOYAGE_RE = /^#\/(?:voyage|journey)\/?$/;
export const tunnelOpen = signal(VOYAGE_RE.test(location.hash));
export function openTunnel() {
  if (!VOYAGE_RE.test(location.hash)) { history.pushState(null, "", "#/voyage"); depth++; }
  if (view.peek().name !== "journal") view.value = { name: "journal" };
  tunnelOpen.value = true;
}
export function closeTunnel() {
  if (!tunnelOpen.value) return;
  if (VOYAGE_RE.test(location.hash)) {
    if (depth > 0) { history.back(); return; } // the popstate below closes it
    history.replaceState(null, "", hrefFor({ name: "journal" }));
  }
  tunnelOpen.value = false;
}
/** From the voyage to a photo's day: the voyage's address becomes the journal's, so "back" comes to the journal. */
export function leaveTunnelFor(v: View) {
  if (VOYAGE_RE.test(location.hash)) history.replaceState(null, "", hrefFor({ name: "journal" }));
  tunnelOpen.value = false;
  go(v);
}

/** Back inside the site; never leaves it (shared links land without in-site history). */
export function goBack() {
  if (depth > 0) history.back();
  else go({ name: "home" }, { replace: true });
}

export function go(v: View, opts: { replace?: boolean } = {}) {
  const href = hrefFor(v);
  if (opts.replace) history.replaceState(null, "", href);
  else if (location.hash !== href) { history.pushState(null, "", href); depth++; }
  view.value = v;
  if (v.name === "day" || v.name === "place") detent.value = isDesktop.value ? "full" : detent.value === "full" && v.name === "day" ? "full" : "half";
  else if (v.name === "home") detent.value = detent.value === "full" ? "half" : detent.value;
  else detent.value = "full";
}

window.addEventListener("popstate", () => {
  depth = Math.max(0, depth - 1);
  if (trailMode.value && !FLYOVER_RE.test(location.hash)) trailMode.value = null;
  tunnelOpen.value = VOYAGE_RE.test(location.hash);
  if (FLYOVER_RE.test(location.hash)) return; // back to a flyover address: the view under it stays
  const v = parse(location.hash);
  view.value = v;
  if (v.name === "home" && detent.value === "full") detent.value = "half";
  else if ((v.name === "place" || v.name === "day") && !isDesktop.value && detent.value === "peek") detent.value = "half";
  else if (v.name === "explore" || v.name === "journal" || v.name === "stats" || v.name === "about") detent.value = "full";
});

let toastTimer: number | undefined;
export function toast(msg: string, ms = 2200) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastMsg.value = null), ms);
}
