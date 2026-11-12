import { signal } from "@preact/signals";

export type Page =
  | { name: "home" }
  | { name: "editor"; id: string }
  | { name: "checkin" }
  | { name: "positions" }
  | { name: "messages" }
  | { name: "settings" }
  | { name: "gear" }
  | { name: "tracking" }
  | { name: "help" }
  | { name: "preview"; id: string };

export const page = signal<Page>({ name: "home" });
export const flash = signal<string | null>(null);

export function open(p: Page) {
  page.value = p;
  history.pushState({ p }, "");
  window.scrollTo(0, 0);
}
/** Back where we came from (the phone's own back, so the swipe and the button agree), else to `p`. */
export function goBackOr(p: Page) {
  if (history.length > 1 && history.state?.p && history.state.p.name === page.value.name) history.back();
  else { page.value = p; window.scrollTo(0, 0); }
}
export function home() {
  page.value = { name: "home" };
  window.scrollTo(0, 0);
}
window.addEventListener("popstate", (e) => {
  page.value = (e.state?.p as Page) ?? { name: "home" };
});

let t: number | undefined;
export function say(msg: string, ms = 2600) {
  flash.value = msg;
  clearTimeout(t);
  t = window.setTimeout(() => (flash.value = null), ms);
}
