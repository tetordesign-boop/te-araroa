import { signal } from "@preact/signals";
import type { TrailMap } from "../map/map";

export type View =
  | { name: "home" }
  | { name: "journal" }
  | { name: "day"; n: number; photo?: string }
  | { name: "stats" }
  | { name: "about" };

export type Detent = "peek" | "half" | "full";

function parse(hash: string): View {
  const h = hash.replace(/^#\/?/, "");
  const [a, b, c] = h.split("/");
  if (a === "journal") return { name: "journal" };
  if ((a === "jour" || a === "day") && b && /^\d+$/.test(b)) return { name: "day", n: parseInt(b, 10), photo: c || undefined };
  if (a === "stats") return { name: "stats" };
  if (a === "apropos" || a === "about") return { name: "about" };
  return { name: "home" };
}

export const view = signal<View>(parse(location.hash));
export const detent = signal<Detent>(view.value.name === "home" ? "peek" : view.value.name === "day" ? "half" : "full");
export const toastMsg = signal<string | null>(null);
export const replayState = signal<{ n: number; progress: number; stop: () => void } | null>(null);
export const mapApi = signal<TrailMap | null>(null);
export const isDesktop = signal(window.matchMedia("(min-width: 900px)").matches);
window.matchMedia("(min-width: 900px)").addEventListener("change", (e) => (isDesktop.value = e.matches));

export function hrefFor(v: View): string {
  switch (v.name) {
    case "home": return "#/";
    case "journal": return "#/journal";
    case "day": return `#/jour/${v.n}${v.photo ? `/${v.photo}` : ""}`;
    case "stats": return "#/stats";
    case "about": return "#/apropos";
  }
}

let depth = 0;

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
  if (v.name === "day") detent.value = isDesktop.value ? "full" : detent.value === "full" ? "full" : "half";
  else if (v.name === "home") detent.value = detent.value === "full" ? "half" : detent.value;
  else detent.value = "full";
}

window.addEventListener("popstate", () => {
  depth = Math.max(0, depth - 1);
  const v = parse(location.hash);
  view.value = v;
  if (v.name === "home" && detent.value === "full") detent.value = "half";
});

let toastTimer: number | undefined;
export function toast(msg: string, ms = 2200) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastMsg.value = null), ms);
}
