import { render } from "preact";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "./styles/app.css";
import { lang } from "./i18n";
import { startData } from "./lib/data";
import { loadPlaces } from "./lib/places";
import { App } from "./ui/App";

document.documentElement.lang = lang.value;
startData();
loadPlaces();
render(<App />, document.getElementById("app")!);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
