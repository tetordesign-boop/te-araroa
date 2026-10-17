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

document.documentElement.lang = lang.value;
startData();
loadPlaces();
installTapSounds();
if (window.matchMedia("(pointer: coarse)").matches) {
  // Safari's own pinch-zoom of the page (the map and the photos have their own zoom)
  for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
render(<App />, document.getElementById("app")!);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
