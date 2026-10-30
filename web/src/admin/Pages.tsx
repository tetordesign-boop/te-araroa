import { useEffect, useState } from "preact/hooks";
import { FUNCTIONS_URL } from "../config";
import { fmtDate, fmtKm, nzToday, relTime } from "../lib/format";
import type { Settings } from "../types";
import { ChevronLeft, ChevronRight, Locate } from "../ui/icons";
import { draftForToday, draftFromDay, openDraft } from "./Editor";
import { InstallHint } from "./InstallHint";
import { home, open, say } from "./nav";
import { adminDays, adminRoute, adminSettings, loadServer } from "./server";
import { sba, signOut } from "./sb";
import { fetchPositions, type Pos } from "./Positions";
import { drafts, online, outbox, queuePosition, syncAll, syncing } from "./store";

const siteUrl = () => new URL("../", location.href).toString();

function Bar({ title, back = true, right }: { title: string; back?: boolean; right?: preact.ComponentChildren }) {
  return (
    <div class="adm-bar">
      <span class="adm-bar__left">{back && <button class="textbtn" type="button" onClick={home}><ChevronLeft />Carnet</button>}</span>
      <span class="adm-bar__title">{title}</span>
      <span class="adm-bar__right">{right}</span>
    </div>
  );
}

export function SyncPill() {
  const s = syncing.value;
  const waiting = drafts.value.filter((d) => d.status === "queued" || d.status === "error" || d.status === "syncing").length + outbox.value;
  const failed = drafts.value.find((d) => d.status === "error");
  if (s) return <div class="syncpill is-busy" role="status"><span class="syncpill__dot" />Envoi de {s.label}… {Math.round(s.progress * 100)} %</div>;
  if (failed && online.value) return <button class="syncpill is-error" type="button" onClick={() => syncAll(true)}><span class="syncpill__dot" />Envoi en échec, toucher pour réessayer</button>;
  if (waiting && !online.value) return <div class="syncpill is-waiting" role="status"><span class="syncpill__dot" />{waiting} en attente de réseau</div>;
  if (waiting) return <div class="syncpill is-busy" role="status"><span class="syncpill__dot" />{waiting} en cours d'envoi</div>;
  return <div class="syncpill" role="status"><span class="syncpill__dot" />{online.value ? "Tout est en ligne" : "Hors ligne, rien en attente"}</div>;
}

/** The last point the site received, in a few words (for the Carnet's home and the tracking page). */
function useLastPoint(source?: string) {
  const [last, setLast] = useState<Pos | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => fetchPositions(source ? 30 : 1)
      .then((l) => { if (alive) setLast((source ? l.find((p) => p.source === source) : l[0]) ?? null); })
      .catch(() => { /* offline: keep what is shown */ });
    load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return last;
}
const lastLine = (p: Pos | null | undefined) =>
  p === undefined ? "…" : p === null ? "Aucun point reçu pour l'instant" : `Dernier point ${relTime(p.recorded_at, "fr")}${p.source === "owntracks" ? ", OwnTracks" : p.source === "checkin" ? ", à la main" : ""}`;

/**
 * Until he sets off: what is left to get ready, each line ticked from what the server knows (not from what he
 * said he did), and gone once the trail has started.
 */
function BeforeDeparture({ s, lastOwn }: { s: Settings; lastOwn: Pos | null | undefined }) {
  if (s.start_date && s.start_date <= nzToday()) return null;
  const recentOwn = !!lastOwn && Date.now() - Date.parse(lastOwn.recorded_at) < 14 * 86400e3;
  const oldIntro = /livre de refuge|hut book/i.test(`${s.intro_fr ?? ""} ${s.intro_en ?? ""}`);
  const items = [
    {
      done: !!s.start_date, title: "Ta date de départ", page: "settings" as const,
      meta: s.start_date ? `Le ${fmtDate(s.start_date, "fr")}` : "Réglages › Départ de Ship Cove. Elle numérote tes jours, et ta position n'apparaît sur le site qu'à partir de cette date : sans elle, jamais.",
    },
    {
      done: recentOwn, title: "Tester OwnTracks", page: "positions" as const,
      meta: lastOwn === undefined ? "…" : recentOwn ? `Point reçu ${relTime(lastOwn!.recorded_at, "fr")}` : "Envoie un point depuis OwnTracks : la page Ma position explique comment, et le montre dès qu'il arrive.",
    },
    {
      done: !oldIntro, title: "Ta présentation", page: "settings" as const,
      meta: oldIntro ? "Elle parle encore du « livre de refuge » : les mots de tes proches sont maintenant privés, sous « Un mot pour Ewan »." : "À jour",
    },
  ];
  const left = items.filter((i) => !i.done).length;
  return (
    <>
      <div class="group__title" style={{ marginTop: "18px" }}>Avant le départ{left ? `, ${left === 1 ? "1 chose" : `${left} choses`} à faire` : ", tout est prêt"}</div>
      <div class="group">
        {items.map((i) => (
          <button class="cell" type="button" onClick={() => open({ name: i.page })}>
            <span class={`check${i.done ? " is-done" : ""}`} aria-hidden="true">{i.done ? "✓" : ""}</span>
            <span class="cell__main">
              <span class="cell__title">{i.title}<span class="sr-only">{i.done ? ", fait" : ", à faire"}</span></span>
              <span class="cell__meta">{i.meta}</span>
            </span>
            <ChevronRight class="cell__chev" />
          </button>
        ))}
      </div>
    </>
  );
}

export function Dashboard() {
  const s = adminSettings.value;
  const today = nzToday();
  const days = [...adminDays.value].reverse();
  const local = drafts.value;
  const name = s?.hiker_name || "Ewan";
  const lastPoint = useLastPoint();
  const lastOwn = useLastPoint("owntracks");
  const newNotes = useNewNotes();

  const edit = (id: string) => open({ name: "editor", id });
  const startToday = () => openDraft(draftForToday(), edit);
  const statusLine = (d: (typeof local)[number]) =>
    d.status === "editing" ? (d.isNew ? "Brouillon, pas encore publié" : "Modifications pas encore publiées")
      : d.status === "queued" ? (online.value ? "En attente d'envoi" : "Prêt, part dès qu'il y a du réseau")
        : d.status === "syncing" ? "Envoi en cours…"
          : d.status === "error" ? `Échec : ${d.error ?? ""}` : "";

  return (
    <div class="adm">
      <Bar title="" back={false} right={<a class="textbtn" href={siteUrl()} target="_blank" rel="noopener">Voir le site</a>} />
      <h1 class="adm-h1">Carnet</h1>
      <p class="adm-sub">Bonjour {name}, on est le {fmtDate(today, "fr")} en Nouvelle-Zélande.</p>
      <SyncPill />
      <InstallHint />
      {s && <BeforeDeparture s={s} lastOwn={lastOwn} />}

      <button class="bigbtn bigbtn--primary" type="button" onClick={startToday}>
        {local.some((d) => d.date === today) || adminDays.value.some((d) => d.date === today) ? "Reprendre l'étape du jour" : "Publier l'étape du jour"}
      </button>
      <button class="bigbtn bigbtn--secondary" type="button" onClick={() => open({ name: "checkin" })}><Locate />Partager ma position</button>

      {local.length > 0 && (
        <>
          <div class="group__title" style={{ marginTop: "18px" }}>Sur ce téléphone</div>
          <div class="group">
            {local.map((d) => (
              <button class="cell" type="button" onClick={() => edit(d.id)}>
                <span class="cell__main">
                  <span class="cell__title">Jour {d.day_number}{d.title ? `, ${d.title}` : ""}</span>
                  <span class={`cell__meta${d.status === "error" ? " danger" : ""}`}>
                    {statusLine(d)}
                    {d.media.length ? `, ${d.media.length} média${d.media.length > 1 ? "s" : ""}` : ""}
                  </span>
                </span>
                <ChevronRight class="cell__chev" />
              </button>
            ))}
          </div>
        </>
      )}

      <div class="group__title" style={{ marginTop: "18px" }}>Étapes publiées</div>
      <div class="group">
        {days.length === 0 && <div class="cell"><span class="cell__meta">Rien pour l'instant. Ta première étape apparaîtra ici.</span></div>}
        {days.map((d) => (
          <button class="cell" type="button" onClick={() => openDraft(drafts.value.find((x) => x.id === d.id) ?? draftFromDay(d), edit)}>
            <span class="cell__main">
              <span class="cell__title">Jour {d.day_number}{d.title ? `, ${d.title}` : d.end_name ? `, ${d.end_name}` : ""}</span>
              <span class="cell__meta">{fmtDate(d.date, "fr", { day: "numeric", month: "short" })}{d.distance_km ? `, ${fmtKm(d.distance_km, "fr", 1)} km` : ""}{d.published ? "" : ", masquée"}</span>
            </span>
            <ChevronRight class="cell__chev" />
          </button>
        ))}
      </div>

      <div class="group">
        <button class="cell" type="button" onClick={() => open({ name: "positions" })}><span class="cell__main"><span class="cell__title">Ma position</span><span class="cell__meta">{lastLine(lastPoint)}</span></span><ChevronRight class="cell__chev" /></button>
        <button class="cell" type="button" onClick={() => open({ name: "messages" })}><span class="cell__main"><span class="cell__title">Mots de tes proches</span><span class="cell__meta">{newNotes === null ? "Toi seul les lis" : newNotes === 0 ? "Aucun nouveau mot" : newNotes === 1 ? "1 nouveau mot" : `${newNotes} nouveaux mots`}</span></span>{!!newNotes && <span class="badge-count" aria-hidden="true">{newNotes}</span>}<ChevronRight class="cell__chev" /></button>
        <button class="cell" type="button" onClick={() => open({ name: "tracking" })}><span class="cell__main"><span class="cell__title">Suivi automatique</span><span class="cell__meta">OwnTracks sur ton iPhone</span></span><ChevronRight class="cell__chev" /></button>
        <button class="cell" type="button" onClick={() => open({ name: "settings" })}><span class="cell__main"><span class="cell__title">Réglages</span></span><ChevronRight class="cell__chev" /></button>
        <button class="cell" type="button" onClick={() => open({ name: "help" })}><span class="cell__main"><span class="cell__title">Mode d'emploi</span><span class="cell__meta">Sans réseau, photos, position, en cas de souci</span></span><ChevronRight class="cell__chev" /></button>
      </div>
      <div class="group">
        <button class="cell danger" type="button" onClick={() => { if (confirm("Se déconnecter ? Les brouillons non envoyés restent sur ce téléphone.")) signOut(); }}>Se déconnecter</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ check-in
export function Checkin() {
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) { setErr("Localisation indisponible."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setPos(p); setErr(null); },
      (e) => setErr(e.code === 1 ? "Autorise la localisation pour ce site (Réglages › Safari › Localisation)." : "Recherche du signal GPS…"),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const snap = pos ? adminRoute.value.nearest([pos.coords.longitude, pos.coords.latitude]) : null;

  const send = async () => {
    if (!pos) return;
    setBusy(true);
    await queuePosition({
      recorded_at: new Date(pos.timestamp).toISOString(), lat: pos.coords.latitude, lng: pos.coords.longitude,
      acc: Math.round(pos.coords.accuracy), note: note.trim() || null,
    });
    setBusy(false);
    say(online.value ? "Position envoyée." : "Position enregistrée, envoi dès que tu as du réseau.");
    home();
  };

  return (
    <div class="adm">
      <Bar title="Ma position" />
      <div class="group" style={{ marginTop: "8px" }}>
        <div class="cell cell--stack">
          {pos ? (
            <>
              <span class="cell__title">{snap && snap.dist < 3000 ? `Sur le sentier, km ${fmtKm(snap.km, "fr", 1)}` : `À ${fmtKm((snap?.dist ?? 0) / 1000, "fr", 1)} km du sentier`}</span>
              <span class="cell__meta num">{pos.coords.latitude.toFixed(5)}, {pos.coords.longitude.toFixed(5)}, précision {Math.round(pos.coords.accuracy)} m</span>
            </>
          ) : <span class="cell__meta">{err ?? "Recherche de ta position…"}</span>}
        </div>
        <label class="cell cell--stack">
          <input value={note} maxLength={280} placeholder="Petit mot (facultatif) : bien arrivé au refuge !" onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <button class="bigbtn bigbtn--primary" type="button" disabled={!pos || busy} onClick={send}>Envoyer ma position</button>
      <p class="note">Sans réseau, ta position est gardée sur le téléphone et part toute seule dès que tu captes. Pour un suivi sans y penser, active le suivi automatique.</p>
    </div>
  );
}

// ------------------------------------------------------------------ notes from family and friends (only Ewan reads them)
const SEEN_KEY = "notes-seen";
const notesSeen = () => { try { return localStorage.getItem(SEEN_KEY) ?? "1970-01-01T00:00:00Z"; } catch (_) { return "1970-01-01T00:00:00Z"; } };

/** How many notes came in since Ewan last opened the page (null: unknown, e.g. no signal). */
function useNewNotes() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    sba.from("messages").select("id", { count: "exact", head: true }).gt("created_at", notesSeen())
      .then(({ count, error }) => setN(error ? null : count ?? 0));
  }, []);
  return n;
}

interface Msg { id: string; day_id: string | null; author: string; body: string; created_at: string }
export function Notes() {
  const [list, setList] = useState<Msg[] | null>(null);
  const [failed, setFailed] = useState(false);
  // what was new when the page opened stays marked while Ewan reads; next time, it is not new any more
  const [seen] = useState(notesSeen);
  const load = async () => {
    const { data, error } = await sba.from("messages").select("id,day_id,author,body,created_at").order("created_at", { ascending: false }).limit(300);
    if (error) { setFailed(true); return; }
    setFailed(false);
    setList((data ?? []) as Msg[]);
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (_) { /* ignore */ }
  };
  useEffect(() => { load(); }, []);
  const dayOf = (id: string | null) => adminDays.value.find((d) => d.id === id);
  return (
    <div class="adm">
      <Bar title="Mots de tes proches" />
      <p class="adm-sub" style={{ marginTop: "8px" }}>Ce que tes proches t'écrivent depuis le site. Toi seul les lis : ils n'apparaissent nulle part sur le site.</p>
      {failed ? <p class="adm-sub">Pas de réseau pour l'instant : les mots arriveront dès qu'il revient.</p>
        : list === null ? <p class="adm-sub">Chargement…</p>
        : list.length === 0 ? <p class="adm-sub">Aucun mot pour l'instant. Ceux de tes proches arriveront ici.</p> : (
        <div class="group">
          {list.map((m) => {
            const d = dayOf(m.day_id);
            const fresh = Date.parse(m.created_at) > Date.parse(seen);
            return (
              <div class="cell cell--stack">
                <span class="cell__title">{fresh && <span class="badge-new">Nouveau</span>}<strong>{m.author}</strong></span>
                <span class="cell__meta">{relTime(m.created_at, "fr")}{d ? `, depuis le jour ${d.day_number}` : ", depuis l'accueil du site"}</span>
                <span class="voice" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</span>
                <div class="pickrow">
                  <button class="btn danger" type="button" onClick={async () => {
                    if (!confirm(`Supprimer le mot de ${m.author} ?`)) return;
                    const { error } = await sba.from("messages").delete().eq("id", m.id);
                    if (error) say("Pas supprimé : vérifie le réseau et réessaie."); else { say("Mot supprimé"); load(); }
                  }}>Supprimer</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ automatic tracking (OwnTracks)
export function Tracking() {
  const [pw, setPw] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const lastOwn = useLastPoint("owntracks");
  useEffect(() => {
    sba.rpc("admin_tracking_config").then(({ data }) => setPw((data as { owntracks_password?: string } | null)?.owntracks_password ?? null));
  }, []);
  const url = `${FUNCTIONS_URL}/owntracks`;
  const config = pw ? {
    _type: "configuration", mode: 3, url, auth: true, username: "ewan", password: pw, deviceId: "iphone", tid: "EW",
    monitoring: 1, locatorInterval: 600, locatorDisplacement: 300, ranging: false, cmd: false, allowRemoteLocation: false,
  } : null;
  const inline = config ? `owntracks:///config?inline=${btoa(unescape(encodeURIComponent(JSON.stringify(config))))}` : null;
  return (
    <div class="adm">
      <Bar title="Suivi automatique" />
      <p class="adm-sub" style={{ marginTop: "8px" }}>
        L'appli gratuite OwnTracks envoie ta position en arrière-plan quand tu as du réseau, et garde les points en mémoire quand tu n'en as pas. Tes proches voient alors ta progression sans que tu y penses.
      </p>
      <div class="group">
        <ol class="steps">
          <li>Installe OwnTracks depuis l'App Store.<br /><a class="textbtn" href="https://apps.apple.com/app/owntracks/id692424691" target="_blank" rel="noopener">Ouvrir l'App Store</a></li>
          <li>Reviens ici et touche le bouton : OwnTracks s'ouvre et se règle tout seul.<br />
            {inline ? <a class="textbtn" href={inline}>Configurer OwnTracks</a> : <span class="cell__meta">Chargement…</span>}</li>
          <li>Dans OwnTracks, autorise la localisation « Toujours », puis choisis le mode « Significant » (économe en batterie).</li>
        </ol>
      </div>
      <div class="group">
        <button class="cell" type="button" onClick={() => open({ name: "positions" })}>
          <span class="cell__main">
            <span class="cell__title">Vérifier que ça marche</span>
            <span class="cell__meta">{lastOwn === null ? "Rien reçu d'OwnTracks pour l'instant" : lastLine(lastOwn)}</span>
          </span>
          <ChevronRight class="cell__chev" />
        </button>
      </div>
      <div class="group__title">Le mettre en pause</div>
      <p class="group__foot" style={{ marginTop: 0 }}>Dans OwnTracks, touche le bouton de mode en haut de la carte et choisis « Quiet » : plus rien ne part. Choisis à nouveau « Significant » pour reprendre. Un point envoyé par erreur se supprime dans <button class="textbtn" type="button" onClick={() => open({ name: "positions" })}>Ma position</button>.</p>
      <div class="group__title">Réglage manuel (si le bouton ne marche pas)</div>
      <div class="group">
        <div class="cell"><span>Mode</span><span class="cell__value">HTTP</span></div>
        <div class="cell cell--stack"><span>URL</span><span class="code">{url}</span></div>
        <div class="cell"><span>Identifiant</span><span class="cell__value">ewan</span></div>
        <div class="cell"><span>Mot de passe</span>
          <button class="textbtn" type="button" onClick={() => setShow(!show)}>{show ? <span class="code">{pw ?? "…"}</span> : "Afficher"}</button>
        </div>
      </div>
      <p class="note">Garde ce mot de passe pour toi : il permet d'écrire des positions sur ton site.</p>
    </div>
  );
}

// ------------------------------------------------------------------ settings
export function SettingsPage() {
  const s = adminSettings.value;
  const [f, setF] = useState<Partial<Settings>>(() => ({ ...s }));
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<{ bytes: number; files: number } | null>(null);
  const [trailMsg, setTrailMsg] = useState<string | null>(null);
  useEffect(() => { sba.rpc("admin_storage_usage").then(({ data }) => data && setUsage(data as { bytes: number; files: number })); }, []);
  const set = (k: keyof Settings) => (e: Event) => setF({ ...f, [k]: ((e.target as HTMLInputElement).value || null) as never });

  const save = async () => {
    setSaving(true);
    const { site_title, site_tagline_fr, site_tagline_en, hiker_name, intro_fr, intro_en, start_date, position_delay_minutes, linz_api_key } = f;
    const { error } = await sba.from("settings").update({
      site_title: site_title || "Te Araroa", site_tagline_fr: site_tagline_fr || "", site_tagline_en: site_tagline_en || "",
      hiker_name, intro_fr, intro_en, start_date, position_delay_minutes: Number(position_delay_minutes) || 0, linz_api_key,
    }).eq("id", 1);
    setSaving(false);
    if (error) { say(`Erreur : ${error.message}`); return; }
    await loadServer();
    say("Réglages enregistrés.");
  };

  const refreshTrail = async () => {
    setTrailMsg("Téléchargement du tracé officiel…");
    const { data } = await sba.auth.getSession();
    const call = (action: string) => fetch(`${FUNCTIONS_URL}/trail-import`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ action }),
    }).then((r) => r.json());
    try {
      const a = await call("ingest");
      if (a.error) throw new Error(a.error);
      setTrailMsg("Construction du parcours…");
      const b = await call("build");
      if (b.error) throw new Error(b.error);
      setTrailMsg(`Tracé à jour : ${fmtKm(b.meta.total_km, "fr", 1)} km (saison ${b.meta.version}).`);
    } catch (e) {
      setTrailMsg(`Échec : ${(e as Error).message}`);
    }
  };

  const mb = usage ? usage.bytes / 1024 / 1024 : 0;
  return (
    <div class="adm">
      <Bar title="Réglages" right={<button class="textbtn textbtn--strong" type="button" disabled={saving} onClick={save}>{saving ? "…" : "OK"}</button>} />
      <div class="group__title" style={{ marginTop: "12px" }}>Le site</div>
      <div class="group">
        <label class="cell"><span>Ton prénom</span><input value={f.hiker_name ?? ""} onInput={set("hiker_name")} /></label>
        <label class="cell"><span>Titre</span><input value={f.site_title ?? ""} onInput={set("site_title")} /></label>
        <label class="cell"><span>Sous-titre</span><input value={f.site_tagline_fr ?? ""} onInput={set("site_tagline_fr")} /></label>
        <label class="cell"><span>Sous-titre (EN)</span><input value={f.site_tagline_en ?? ""} onInput={set("site_tagline_en")} /></label>
        <label class="cell"><span>Départ de Ship Cove</span><input type="date" value={f.start_date ?? ""} onInput={set("start_date")} /></label>
      </div>
      <div class="group__title">Présentation (page « À propos »)</div>
      <div class="group">
        <label class="cell cell--stack"><textarea value={f.intro_fr ?? ""} placeholder="Quelques mots pour tes proches" onInput={set("intro_fr")} /></label>
        <label class="cell cell--stack"><textarea value={f.intro_en ?? ""} placeholder="The same in English (optional)" onInput={set("intro_en")} /></label>
      </div>
      <div class="group__title">Confidentialité</div>
      <div class="group">
        <label class="cell"><span>Afficher ma position avec</span>
          <select value={String(f.position_delay_minutes ?? 0)} onChange={set("position_delay_minutes")}>
            <option value="0">aucun délai</option><option value="60">1 h de retard</option><option value="180">3 h de retard</option>
            <option value="720">12 h de retard</option><option value="1440">24 h de retard</option>
          </select>
        </label>
      </div>
      <p class="group__foot">Le retard s'applique à ta position en direct. Une étape publiée montre tout de suite son point d'arrivée et le lieu de ses photos. Ta position n'apparaît qu'à partir de la date de départ, et le site n'est pas référencé sur Google : seules les personnes qui ont le lien le voient.</p>
      <div class="group__title">Carte</div>
      <div class="group">
        <label class="cell cell--stack"><span class="cell__meta">Clé LINZ Basemaps (imagerie aérienne néo-zélandaise, facultatif)</span>
          <input value={f.linz_api_key ?? ""} placeholder="c01…" autoCapitalize="off" spellcheck={false} onInput={set("linz_api_key")} /></label>
        <button class="cell" type="button" onClick={refreshTrail}><span class="cell__main"><span class="cell__title">Mettre à jour le tracé officiel</span>{trailMsg && <span class="cell__meta">{trailMsg}</span>}</span></button>
      </div>
      <div class="group__title">Stockage des photos</div>
      <div class="group">
        <div class="cell"><span>Utilisé</span><span class="cell__value num">{usage ? `${fmtKm(mb, "fr", mb < 10 ? 1 : 0)} Mo sur 1 000 Mo, ${usage.files} fichiers` : "…"}</span></div>
      </div>
      <button class="bigbtn bigbtn--primary" type="button" disabled={saving} onClick={save}>Enregistrer</button>
    </div>
  );
}

// ------------------------------------------------------------------ help (works offline: it's part of the app)
export function Help() {
  return (
    <div class="adm help">
      <Bar title="Mode d'emploi" />

      <h2>Publier une étape</h2>
      <div class="group">
        <ol class="steps">
          <li>Touche <strong>Publier l'étape du jour</strong>.</li>
          <li>Arrivée : <strong>Ma position</strong> si tu es au bout de l'étape, sinon <strong>Sur la carte</strong> ou <strong>Lieu de ma dernière photo</strong>. Distance, montée et descente se calculent seules.</li>
          <li>Écris ou dicte ton récit (le micro du clavier), choisis météo et humeur, ajoute photos et vidéos. ★ choisit la couverture.</li>
          <li>Touche <strong>Publier</strong>. Tu peux revenir corriger une étape plus tard : touche-la dans la liste, modifie, puis Publier à nouveau.</li>
        </ol>
      </div>

      <h2>Sans réseau</h2>
      <p>Tout s'enregistre sur le téléphone, même en mode avion. Dès que tu captes, l'envoi part tout seul.</p>
      <p><strong>Important :</strong> l'iPhone n'envoie que quand le carnet est ouvert à l'écran. En arrivant dans un village avec du réseau ou du wifi, ouvre le carnet et laisse-le ouvert jusqu'à voir <span class="key">« Tout est en ligne »</span>. Les grosses vidéos reprennent là où elles s'étaient arrêtées.</p>

      <h2>Photos et vidéos</h2>
      <p>Dans le sélecteur de photos, touche <strong>Options</strong> en haut et vérifie que <strong>Position</strong> est activée : tes photos apparaîtront à l'endroit exact sur la carte. Sinon elles sont rangées le long de l'étape.</p>
      <p>Les photos sont allégées avant l'envoi (moins de réseau, et le stockage gratuit de 1 Go tient toute la saison). Garde les vidéos courtes, moins d'une minute ; pour plus long, mets la vidéo sur YouTube et colle le lien.</p>

      <h2>Ta position</h2>
      <p><strong>Suivi automatique</strong> (OwnTracks) : ta position part en arrière-plan quand tu as du réseau, sans ouvrir le carnet. Les points enregistrés sans réseau partent ensuite.</p>
      <p><strong>Partager ma position</strong> : un point à la main, avec un petit mot si tu veux.</p>
      <p>Dans Réglages, tu peux afficher ta position avec du retard (1 h à 24 h).</p>
      <p><strong>Ma position</strong> montre chaque point reçu, sur une carte, avec qui peut le voir. Avant ta date de départ, tout reste privé : teste autant que tu veux.</p>

      <h2>En cas de souci</h2>
      <div class="group">
        <div class="cell cell--stack"><span class="cell__title">Pastille rouge « Envoi en échec »</span><span class="cell__meta">Touche-la pour réessayer. Le message sous l'étape dit ce qui coince (date déjà prise, fichier trop lourd…).</span></div>
        <div class="cell cell--stack"><span class="cell__title">« Session expirée »</span><span class="cell__meta">Se déconnecter puis se reconnecter. Les brouillons restent sur le téléphone.</span></div>
        <div class="cell cell--stack"><span class="cell__title">Le site ne montre plus rien</span><span class="cell__meta">La base gratuite se met en pause après une semaine sans aucune visite. Va sur supabase.com, ouvre le projet te-araroa et touche « Restore ».</span></div>
        <div class="cell cell--stack"><span class="cell__title">Stockage presque plein</span><span class="cell__meta">Réglages › Stockage des photos. Retire de vieilles vidéos ou passe-les en lien YouTube.</span></div>
        <div class="cell cell--stack"><span class="cell__title">Un point faux sur la carte</span><span class="cell__meta">Le GPS a sauté (point en mer, dans la vallée d'à côté) : Ma position, puis Supprimer sur ce point.</span></div>
        <div class="cell cell--stack"><span class="cell__title">Ta position n'arrive plus</span><span class="cell__meta">Ma position dit quand le dernier point est arrivé. Pas de réseau : rien à faire, OwnTracks garde les points et les envoie plus tard. Sinon, ouvre OwnTracks et touche la flèche d'envoi, puis vérifie Suivi automatique.</span></div>
        <div class="cell cell--stack"><span class="cell__title">Couper le suivi un moment</span><span class="cell__meta">Dans OwnTracks, mode « Quiet ». Mode « Significant » pour reprendre.</span></div>
        <div class="cell cell--stack"><span class="cell__title">E-mail de GitHub « Veille du site »</span><span class="cell__meta">Chaque jour, une vérification automatique regarde que le site, la base et le suivi répondent. Si elle échoue, GitHub t'écrit : la cause la plus courante est la base en pause (voir plus haut).</span></div>
      </div>
    </div>
  );
}
