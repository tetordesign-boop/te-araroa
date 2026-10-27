import { useEffect } from "preact/hooks";
import { MOCK } from "../config";
import { AuthPage } from "./AuthPage";
import { Editor } from "./Editor";
import { flash, page } from "./nav";
import { Checkin, Dashboard, Help, Notes, SettingsPage, Tracking } from "./Pages";
import { Positions } from "./Positions";
import { checkAdmin, isAdmin, session, signOut } from "./sb";
import { adminDays, adminMedia, adminRoute, adminSettings, loadRoute, loadServer, readAdminCache } from "./server";
import { afterSync, loadDrafts, startSyncLoop } from "./store";

let booted = false;

export function AdminApp() {
  const admin = isAdmin.value;
  useEffect(() => {
    if (!admin || booted) return;
    booted = true;
    // ask the browser not to evict unsent drafts when the phone runs low on space
    navigator.storage?.persist?.().catch(() => {});
    if (MOCK) {
      import("../dev/mock").then(async ({ mockData }) => {
        const d = await mockData(adminRoute.value);
        adminSettings.value = d.settings; adminDays.value = d.days; adminMedia.value = d.media;
      });
      loadDrafts();
      return;
    }
    readAdminCache();
    loadDrafts().then(() => startSyncLoop());
    loadServer();
    loadRoute();
    afterSync(() => loadServer());
    // Fetch now, while there is signal, the parts needed later on the trail with none
    // (reading photo GPS, compressing videos, resumable uploads): the service worker keeps them.
    const warm = () => { import("exifr").catch(() => {}); import("mediabunny").catch(() => {}); import("tus-js-client").catch(() => {}); };
    if (navigator.onLine) window.setTimeout(warm, 2500);
    window.addEventListener("online", () => { loadServer(); loadRoute(); window.setTimeout(warm, 2500); });
  }, [admin]);

  if (!session.value) return <AuthPage />;
  if (admin === null) {
    return (
      <div class="auth">
        <div class="auth__box">
          <h1>Connexion…</h1>
          <p>La toute première ouverture du carnet sur ce téléphone a besoin de réseau. Ensuite, il marche aussi hors ligne.</p>
          <button class="bigbtn bigbtn--primary" type="button" onClick={() => checkAdmin()}>Réessayer</button>
          <button class="bigbtn bigbtn--secondary" type="button" onClick={signOut}>Changer de compte</button>
        </div>
      </div>
    );
  }
  if (admin === false) {
    return (
      <div class="auth">
        <div class="auth__box">
          <h1>Accès refusé</h1>
          <p>Ce compte n'est pas administrateur de ce carnet.</p>
          <button class="bigbtn bigbtn--secondary" type="button" onClick={signOut}>Changer de compte</button>
        </div>
      </div>
    );
  }

  const p = page.value;
  return (
    <>
      {p.name === "editor" ? <Editor id={p.id} />
        : p.name === "checkin" ? <Checkin />
        : p.name === "positions" ? <Positions />
        : p.name === "messages" ? <Notes />
        : p.name === "settings" ? <SettingsPage />
        : p.name === "tracking" ? <Tracking />
        : p.name === "help" ? <Help />
        : <Dashboard />}
      <div class={`toast glass${flash.value ? " is-on" : ""}`} role="status" aria-live="polite" style={{ position: "fixed" }}>{flash.value}</div>
    </>
  );
}
