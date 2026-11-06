import { render } from "preact";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "./styles/app.css";
import { lang } from "./i18n";
import { startData } from "./lib/data";
import { loadPlaces } from "./lib/places";
import { installTapSounds } from "./lib/sound";
import { App } from "./ui/App";
import { installIconFx } from "./ui/iconfx";

document.documentElement.lang = lang.value;
// the presentation's words wait (a moment at most) for their own fonts, rather than come in with stand-ins and jump
if (document.documentElement.classList.contains("is-intro") && document.fonts?.load) {
  const root = document.documentElement;
  const done = () => root.classList.remove("fonts-wait");
  root.classList.add("fonts-wait");
  Promise.all([document.fonts.load('860 100px "Archivo Variable"'), document.fonts.load('18px "Literata Variable"')]).then(done, done);
  window.setTimeout(done, 1500);
}
startData();
loadPlaces();
installTapSounds();
installIconFx();
if (window.matchMedia("(pointer: coarse)").matches) {
  // Safari's own pinch-zoom of the page (the map and the photos have their own zoom)
  for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
render(<App />, document.getElementById("app")!);

// The page itself never scrolls (the sheet's content does). On iOS, once the keyboard has gone, the page can stay
// pushed up by it, which leaves a bar of background at the foot of the screen: put it back.
const unpush = () => { if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0); };
document.addEventListener("focusout", (e) => {
  if ((e.target as Element | null)?.matches?.("input, textarea, [contenteditable]")) window.setTimeout(unpush, 150);
});
window.visualViewport?.addEventListener("resize", () => {
  if (!document.activeElement?.matches?.("input, textarea, [contenteditable]")) unpush();
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
