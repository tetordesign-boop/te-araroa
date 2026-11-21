// My alerts: this phone signs up (Web Push, through the Carnet's service worker) to be told when someone buys or asks
// for a ticket, gives me a hand, leaves me a note, asks a question, or signs up for the site's notifications. The phone's address and keys go
// to public.admin_push (only I can read or change it), with the kinds I want; the database itself then asks the
// "push" function to tell me (supabase/migrations/20261121000200_ewan_alerts.sql). On an iPhone the Carnet has to be
// on the Home Screen and opened from there: Apple only lets web apps opened that way receive notifications.
import { signal } from "@preact/signals";
import { MOCK, SUPABASE_URL } from "../config";
import { sba } from "./sb";

export type AlertKind = "sponsor" | "gift" | "message" | "question" | "follower";
export const ALERT_KINDS: { kind: AlertKind; label: string; meta: string }[] = [
  { kind: "sponsor", label: "Tickets du sentier", meta: "Un ticket acheté, ou demandé gratuitement" },
  { kind: "gift", label: "Coups de pouce", meta: "Un don, avec son montant" },
  { kind: "message", label: "Mots de tes proches", meta: "Un mot laissé sous une étape" },
  { kind: "question", label: "Questions", meta: "Une question posée sur le site" },
  { kind: "follower", label: "Nouveaux abonnés", meta: "Quelqu'un s'abonne aux notifications du site" },
];
const DEFAULT_KINDS: AlertKind[] = ["sponsor", "gift", "message", "question"];

export type AlertState =
  | "unknown" | "unsupported" | "install" // not looked yet / this browser can't / iPhone: Home Screen first
  | "denied" | "missing"                  // notifications refused / the table isn't in the database yet
  | "off" | "busy" | "on";
export const alertState = signal<AlertState>("unknown");
export const alertKinds = signal<AlertKind[]>(DEFAULT_KINDS);

const FN = `${SUPABASE_URL}/functions/v1/push`;
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
const missingTable = (e: { code?: string; message?: string }) => /PGRST205|42P01|does not exist|schema cache/i.test(`${e.code} ${e.message}`);

async function serverKey(): Promise<string> {
  const res = await fetch(FN, { cache: "no-store" });
  if (!res.ok) throw new Error(`push key ${res.status}`);
  const { key } = await res.json();
  if (typeof key !== "string" || key.length < 80) throw new Error("push key");
  return key;
}
async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.ready;
}

/** Where this phone stands (and its keys sent again once a day: the browser may renew them). */
export async function refreshAlerts() {
  if (MOCK) { if (alertState.peek() === "unknown") alertState.value = "off"; return; }
  if (!capable()) { alertState.value = isApple() && !standalone() ? "install" : "unsupported"; return; }
  if (Notification.permission === "denied") { alertState.value = "denied"; return; }
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (!sub || Notification.permission !== "granted") { alertState.value = "off"; return; }
    const { data, error } = await sba.from("admin_push").select("kinds").eq("endpoint", sub.endpoint).maybeSingle();
    if (error) { alertState.value = missingTable(error) ? "missing" : "off"; return; }
    if (!data) { alertState.value = "off"; return; }
    alertKinds.value = (data as { kinds: AlertKind[] }).kinds;
    alertState.value = "on";
    const last = Number(localStorage.getItem("alerts-sync") ?? 0);
    if (Date.now() - last > 86400_000) { await save(sub, alertKinds.value); localStorage.setItem("alerts-sync", String(Date.now())); }
  } catch (_) {
    alertState.value = "off";
  }
}

async function save(sub: PushSubscription, kinds: AlertKind[]) {
  const j = sub.toJSON();
  const { error } = await sba.from("admin_push").upsert({
    endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? bytesB64u(sub.getKey("p256dh")), auth: j.keys?.auth ?? bytesB64u(sub.getKey("auth")),
    kinds, fails: 0, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Switched on by my tap (the phone's question has to come from it). Returns what to say if it didn't work. */
export async function enableAlerts(): Promise<string | null> {
  if (MOCK) { alertState.value = "on"; return null; }
  alertState.value = "busy";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { alertState.value = perm === "denied" ? "denied" : "off"; return perm === "denied" ? null : "Il faut accepter les notifications."; }
    const key = await serverKey();
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (sub && bytesB64u(sub.options.applicationServerKey) !== key) { await sub.unsubscribe(); sub = null; }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) });
    await save(sub, alertKinds.peek());
    try { localStorage.setItem("alerts-sync", String(Date.now())); } catch (_) { /* ignore */ }
    alertState.value = "on";
    void sendTest(sub.endpoint);
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (missingTable(err)) { alertState.value = "missing"; return null; }
    console.warn("alerts", e);
    alertState.value = Notification.permission === "denied" ? "denied" : "off";
    return "Pas réussi : vérifie le réseau et réessaie.";
  }
}

/** Off for this phone: it is taken off the list (the phone keeps its subscription for the site's own notifications). */
export async function disableAlerts() {
  if (MOCK) { alertState.value = "off"; return; }
  alertState.value = "busy";
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) await sba.from("admin_push").delete().eq("endpoint", sub.endpoint);
  } finally {
    alertState.value = "off";
  }
}

export async function setAlertKinds(kinds: AlertKind[]): Promise<boolean> {
  const before = alertKinds.peek();
  alertKinds.value = kinds;
  if (MOCK) return true;
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (!sub) return true;
    const { error } = await sba.from("admin_push").update({ kinds, updated_at: new Date().toISOString() }).eq("endpoint", sub.endpoint);
    if (error) throw error;
    return true;
  } catch (_) {
    alertKinds.value = before;
    return false;
  }
}

/** A first alert to this phone, so I see at once that it works. */
export async function sendTest(endpoint?: string): Promise<boolean> {
  if (MOCK) return true;
  try {
    const ep = endpoint ?? (await (await registration()).pushManager.getSubscription())?.endpoint;
    if (!ep) return false;
    const { error } = await sba.functions.invoke("push", { body: { action: "ewan-test", endpoint: ep } });
    return !error;
  } catch (_) { return false; }
}
