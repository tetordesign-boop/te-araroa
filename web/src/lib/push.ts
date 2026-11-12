// Notifications for family and friends: a phone signs up here (Web Push, through the site's service worker) and the
// "push" server function tells it each time I publish a day (supabase/functions/push). Nothing to install beyond the
// site; on an iPhone the site has to be on the Home Screen first (Apple only allows it to web apps opened from there).
import { effect, signal } from "@preact/signals";
import { MOCK, SUPABASE_URL } from "../config";
import { lang } from "../i18n";
import { deviceId, sb } from "./data";

export type PushState =
  | "unknown"     // not looked yet
  | "unsupported" // this browser can't (nothing is shown)
  | "install"     // an iPhone or iPad in Safari: on the Home Screen first
  | "denied"      // the visitor (or the phone's settings) said no
  | "off" | "busy" | "on";

const FN = `${SUPABASE_URL}/functions/v1/push`;
const KEY_CACHE = "push-key-v1";

export const pushState = signal<PushState>("unknown");
/** the server side is there (the function answers with its key): until then the card stays hidden */
export const pushReady = signal<boolean | null>(MOCK ? true : null);

const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const capable = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const b64uBytes = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
};
const bytesB64u = (b: ArrayBuffer | null) => {
  if (!b) return "";
  let s = "";
  for (const x of new Uint8Array(b)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** the server's public key, kept a day on this phone */
async function serverKey(): Promise<string> {
  try {
    const c = JSON.parse(localStorage.getItem(KEY_CACHE) ?? "null");
    if (c?.key && Date.now() - c.at < 86400_000) return c.key;
  } catch (_) { /* ignore */ }
  const res = await fetch(FN, { cache: "no-store" });
  if (!res.ok) throw new Error(`push key ${res.status}`);
  const { key } = await res.json();
  if (typeof key !== "string" || key.length < 80) throw new Error("push key");
  try { localStorage.setItem(KEY_CACHE, JSON.stringify({ key, at: Date.now() })); } catch (_) { /* private mode */ }
  return key;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.ready;
}

/** tells the database about this phone (again: its keys or its language may have changed) */
async function save(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await sb.rpc("push_subscribe", {
    p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh ?? bytesB64u(sub.getKey("p256dh")), p_auth: j.keys?.auth ?? bytesB64u(sub.getKey("auth")),
    p_lang: lang.peek(), p_device: deviceId,
  });
  if (error) throw error;
}

/** Where this phone stands; also re-sends its subscription once a day (the browser can renew it in between). */
export async function refreshPush() {
  if (MOCK) { if (pushState.peek() === "unknown") pushState.value = new URLSearchParams(location.search).has("push") ? "on" : "off"; return; }
  if (pushReady.peek() === null) serverKey().then(() => { pushReady.value = true; }, () => { pushReady.value = false; });
  if (!capable()) { pushState.value = isApple() && !standalone() ? "install" : "unsupported"; return; }
  if (Notification.permission === "denied") { pushState.value = "denied"; return; }
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    pushState.value = sub && Notification.permission === "granted" ? "on" : "off";
    if (sub && Notification.permission === "granted") {
      const last = Number(localStorage.getItem("push-sync") ?? 0);
      if (Date.now() - last > 86400_000) { await save(sub); localStorage.setItem("push-sync", String(Date.now())); }
    }
  } catch (_) {
    pushState.value = "off";
  }
}

/** Switched on by the visitor's tap (the browser's question has to come from it, so it is asked first). */
export async function enablePush(): Promise<boolean> {
  if (MOCK) { pushState.value = "on"; return true; }
  pushState.value = "busy";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { pushState.value = perm === "denied" ? "denied" : "off"; return false; }
    const key = await serverKey();
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    // (a subscription made with another key can't receive: start again)
    if (sub && bytesB64u(sub.options.applicationServerKey) !== key) { await sub.unsubscribe(); sub = null; }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) });
    await save(sub);
    try { localStorage.setItem("push-sync", String(Date.now())); } catch (_) { /* ignore */ }
    pushState.value = "on";
    // a first notification, so the visitor sees at once that it works
    fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "hello", endpoint: sub.endpoint }) }).catch(() => {});
    return true;
  } catch (e) {
    console.warn("push", e);
    pushState.value = Notification.permission === "denied" ? "denied" : "off";
    return false;
  }
}

export async function disablePush(): Promise<void> {
  if (MOCK) { pushState.value = "off"; return; }
  pushState.value = "busy";
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) {
      await sb.rpc("push_unsubscribe", { p_endpoint: sub.endpoint }).then(() => {}, () => {});
      await sub.unsubscribe();
    }
  } finally {
    pushState.value = "off";
  }
}

let started = false;
/** once, after the page has settled: where this phone stands, and its language kept up to date on the server */
export function startPush() {
  if (started) return;
  started = true;
  refreshPush();
  let first = true;
  effect(() => {
    lang.value;
    if (first) { first = false; return; }
    if (MOCK || pushState.peek() !== "on" || !capable()) return;
    registration().then((r) => r.pushManager.getSubscription()).then((s) => s && save(s)).catch(() => {});
  });
  // (a tap on a notification while the site is open: the service worker asks it to go to the day)
  navigator.serviceWorker?.addEventListener("message", (e) => {
    const d = e.data as { type?: string; url?: string } | null;
    if (d?.type === "open" && typeof d.url === "string") {
      const u = new URL(d.url, location.href);
      if (u.origin === location.origin && u.pathname === location.pathname) location.hash = u.hash;
      else location.href = u.href;
    }
  });
}
