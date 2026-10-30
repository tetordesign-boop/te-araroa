import { render } from "preact";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/literata/opsz.css";
import "../styles/app.css";
import "./admin.css";
import { MOCK } from "../config";
import { installIconFx } from "../ui/iconfx";
import { AdminApp } from "./AdminApp";
import { initAuth, isAdmin, session } from "./sb";

document.body.classList.add("admin");
installIconFx();

if (MOCK) {
  // development preview without a backend
  session.value = { access_token: "mock", user: { id: "mock" } } as never;
  isAdmin.value = true;
} else {
  initAuth();
}
render(<AdminApp />, document.getElementById("admin")!);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("../sw.js", location.href).pathname).catch(() => {});
  });
}
