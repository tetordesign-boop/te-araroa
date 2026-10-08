import { useEffect } from "preact/hooks";
import { AuthPage } from "./AuthPage";
import { Editor } from "./Editor";
import { flash, page } from "./nav";
import { Checkin, Dashboard, Moderation, SettingsPage, Tracking } from "./Pages";
import { isAdmin, session, signOut } from "./sb";
import { MOCK } from "../config";
import { adminDays, adminMedia, adminRoute, adminSettings, loadRoute, loadServer, readAdminCache } from "./server";
import { afterSync, loadDrafts, startSyncLoop } from "./store";

let booted = false;

export function AdminApp() {
  const admin = isAdmin.value;
  useEffect(() => {
    if (!admin || booted) return;
    booted = true;
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
  }, [admin]);

  if (admin === null) return <div class="auth"><p class="adm-sub">Chargement…</p></div>;
  if (!session.value) return <AuthPage />;
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
        : p.name === "messages" ? <Moderation />
        : p.name === "settings" ? <SettingsPage />
        : p.name === "tracking" ? <Tracking />
        : <Dashboard />}
      <div class={`toast glass${flash.value ? " is-on" : ""}`} role="status" aria-live="polite" style={{ position: "fixed" }}>{flash.value}</div>
    </>
  );
}
