import { signal } from "@preact/signals";

export type Page =
  | { name: "home" }
  | { name: "editor"; id: string }
  | { name: "checkin" }
  | { name: "positions" }
  | { name: "messages" }
  | { name: "settings" }
  | { name: "tracking" }
  | { name: "help" };

export const page = signal<Page>({ name: "home" });
export const flash = signal<string | null>(null);

export function open(p: Page) {
  page.value = p;
  history.pushState({ p }, "");
  window.scrollTo(0, 0);
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
