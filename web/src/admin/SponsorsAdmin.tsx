// The Carnet's "Sponsors": the requests sent from the site's "Parraine le sentier" page (who, for which ticket, how
// to reach them, their word), newest first, and the spots I've given. "Attribuer" gives the spot to the name the
// request was signed with (editable first): from then on the site shows the ticket as taken, with that name. Kept in
// supabase/migrations/20261120000100_sponsors.sql; the requests are private, the given spots public.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { MOCK } from "../config";
import { Bar } from "./Pages";
import { say } from "./nav";
import { sba } from "./sb";

interface Req { id: string; spot_id: string; spot_label: string; name: string; contact: string; message: string | null; lang: string; status: "new" | "done"; created_at: string }
interface Given { spot_id: string; name: string }

const requests = signal<Req[] | null>(null);
const given = signal<Given[]>([]);
/** null until asked, false when the tables aren't there yet */
const ready = signal<boolean | null>(null);

export async function loadSponsors() {
  if (MOCK) {
    requests.value = [
      { id: "r1", spot_id: "col-stag-saddle", spot_label: "Stag Saddle", name: "Kea Coffee", contact: "@keacoffee", message: "On adorerait le point le plus haut !", lang: "fr", status: "new", created_at: new Date(Date.now() - 3600e3).toISOString() },
      { id: "r2", spot_id: "km-120", spot_label: "Kilomètre 120", name: "Léa", contact: "lea@example.com", message: null, lang: "fr", status: "done", created_at: new Date(Date.now() - 86400e3).toISOString() },
    ];
    given.value = [{ spot_id: "km-120", name: "Léa" }];
    ready.value = true;
    return;
  }
  const [r, g] = await Promise.all([
    sba.from("sponsor_requests").select("id, spot_id, spot_label, name, contact, message, lang, status, created_at").order("created_at", { ascending: false }).limit(300),
    sba.from("sponsor_spots").select("spot_id, name").order("created_at", { ascending: false }),
  ]);
  if (r.error || g.error) {
    const m = `${r.error?.code ?? ""} ${r.error?.message ?? ""} ${g.error?.code ?? ""} ${g.error?.message ?? ""}`;
    if (/does not exist|schema cache|42P01|PGRST205/i.test(m)) ready.value = false;
    return;
  }
  ready.value = true;
  requests.value = r.data as Req[];
  given.value = g.data as Given[];
}

/** the home cell's line */
export function sponsorsLine(): string {
  if (ready.value === false) return "Pas encore activé";
  const l = requests.value;
  if (!l) return "Les demandes de sponsoring";
  const n = l.filter((r) => r.status === "new").length;
  const g = given.value.length;
  if (n) return `${n} ${n > 1 ? "nouvelles demandes" : "nouvelle demande"}`;
  return g ? `${g} ${g > 1 ? "emplacements attribués" : "emplacement attribué"}` : "Aucune demande pour l'instant";
}

const when = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function SponsorsAdminPage() {
  useEffect(() => { loadSponsors(); }, []);
  const list = requests.value;
  const labels = new Map((list ?? []).map((r) => [r.spot_id, r.spot_label]));
  const fresh = (list ?? []).filter((r) => r.status === "new"), done = (list ?? []).filter((r) => r.status === "done");

  return (
    <div class="adm">
      <Bar title="Sponsors" />
      <p class="adm-sub" style={{ marginTop: "12px" }}>Les demandes envoyées depuis la page « Parraine le sentier ». Toi seul les vois. « Attribuer » réserve le ticket sur le site, au nom que tu choisis.</p>
      {ready.value === false && <p class="note">Les tables ne sont pas encore créées dans la base.</p>}

      <div class="group__title">Nouvelles demandes</div>
      <div class="group">
        {list === null && <div class="cell"><span class="cell__meta">Chargement…</span></div>}
        {list && !fresh.length && <div class="cell"><span class="cell__meta">Rien de nouveau.</span></div>}
        {fresh.map((r) => <RequestCell r={r} />)}
      </div>

      <div class="group__title">Emplacements attribués</div>
      <div class="group">
        {!given.value.length && <div class="cell"><span class="cell__meta">Aucun pour l'instant.</span></div>}
        {given.value.map((g) => <GivenCell g={g} label={labels.get(g.spot_id) ?? g.spot_id} />)}
      </div>

      {done.length > 0 && <>
        <div class="group__title">Demandes traitées</div>
        <div class="group">{done.map((r) => <RequestCell r={r} />)}</div>
      </>}
    </div>
  );
}

function RequestCell({ r }: { r: Req }) {
  const [giving, setGiving] = useState(false);
  const [name, setName] = useState(r.name);
  const [busy, setBusy] = useState(false);
  const isGiven = given.value.some((g) => g.spot_id === r.spot_id);

  const copy = async () => {
    try { await navigator.clipboard.writeText(r.contact); say("Contact copié"); } catch { say("Copie impossible : sélectionne le texte et copie-le."); }
  };
  const setStatus = async (status: "new" | "done") => {
    setBusy(true);
    const { error } = MOCK ? { error: null } : await sba.from("sponsor_requests").update({ status }).eq("id", r.id);
    setBusy(false);
    if (error) { say("Pas enregistré : vérifie le réseau et réessaie."); return; }
    requests.value = (requests.value ?? []).map((x) => (x.id === r.id ? { ...x, status } : x));
  };
  const give = async () => {
    const n = name.trim();
    if (!n) { say("Écris le nom à afficher."); return; }
    setBusy(true);
    const { error } = MOCK ? { error: null } : await sba.from("sponsor_spots").upsert({ spot_id: r.spot_id, name: n });
    if (error) { setBusy(false); say("Pas attribué : vérifie le réseau et réessaie."); return; }
    given.value = [{ spot_id: r.spot_id, name: n }, ...given.value.filter((g) => g.spot_id !== r.spot_id)];
    setGiving(false);
    say(`${r.spot_label} attribué à ${n}.`);
    await setStatus("done");
  };
  const remove = async () => {
    if (!window.confirm(`Supprimer la demande de ${r.name} ?`)) return;
    setBusy(true);
    const { error } = MOCK ? { error: null } : await sba.from("sponsor_requests").delete().eq("id", r.id);
    setBusy(false);
    if (error) { say("Pas supprimée : vérifie le réseau et réessaie."); return; }
    requests.value = (requests.value ?? []).filter((x) => x.id !== r.id);
  };

  return (
    <div class="cell cell--stack spons">
      <div class="spons__head">
        <span class="cell__title">{r.spot_label}</span>
        <span class="cell__meta">{when(r.created_at)}{r.lang === "en" ? " · en anglais" : ""}</span>
      </div>
      <p class="spons__who"><b>{r.name}</b> · <button class="textbtn" type="button" onClick={copy}>{r.contact}</button></p>
      {r.message && <p class="spons__msg">{r.message}</p>}
      {isGiven && <p class="cell__meta">Ce ticket est déjà attribué.</p>}
      {giving ? (
        <div class="spons__give">
          <label class="cell"><span>Nom affiché</span><input value={name} maxLength={60} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
          <div class="spons__actions">
            <button class="textbtn" type="button" disabled={busy} onClick={() => setGiving(false)}>Annuler</button>
            <button class="textbtn textbtn--strong" type="button" disabled={busy} onClick={give}>Attribuer</button>
          </div>
        </div>
      ) : (
        <div class="spons__actions">
          <button class="textbtn danger" type="button" disabled={busy} onClick={remove}>Supprimer</button>
          <span style={{ flex: 1 }} />
          {r.status === "new"
            ? <button class="textbtn" type="button" disabled={busy} onClick={() => setStatus("done")}>Traitée</button>
            : <button class="textbtn" type="button" disabled={busy} onClick={() => setStatus("new")}>Remettre en nouvelle</button>}
          {!isGiven && <button class="textbtn textbtn--strong" type="button" disabled={busy} onClick={() => setGiving(true)}>Attribuer</button>}
        </div>
      )}
    </div>
  );
}

function GivenCell({ g, label }: { g: Given; label: string }) {
  const [busy, setBusy] = useState(false);
  const free = async () => {
    if (!window.confirm(`Libérer « ${label} » ? Le ticket redevient libre sur le site.`)) return;
    setBusy(true);
    const { error } = MOCK ? { error: null } : await sba.from("sponsor_spots").delete().eq("spot_id", g.spot_id);
    setBusy(false);
    if (error) { say("Pas libéré : vérifie le réseau et réessaie."); return; }
    given.value = given.value.filter((x) => x.spot_id !== g.spot_id);
    say(`« ${label} » est de nouveau libre.`);
  };
  return (
    <div class="cell">
      <span class="cell__main"><span class="cell__title">{label}</span><span class="cell__meta">{g.name}</span></span>
      <button class="textbtn danger" type="button" disabled={busy} onClick={free}>Libérer</button>
    </div>
  );
}
