// The Carnet's "Sponsors": the requests sent from the site's "Parraine le sentier" page (who, for which ticket, the
// price they offer, how to reach them, their site, their word), newest first, and the spots I've given. "Attribuer"
// gives the spot: the name shown, the link (site or Instagram) and the logo, which then turns in 3D on the map at that
// spot. Kept in supabase/migrations/20261120000100_sponsors.sql: the requests are private, the given spots public.
// Until that script has run, this page says how to run it from the phone (copy, paste in Supabase, Run).
import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { MOCK, mediaUrl } from "../config";
import { Bar, CopyBtn } from "./Pages";
import { say } from "./nav";
import { sba } from "./sb";

interface Req { id: string; spot_id: string; spot_label: string; name: string; contact: string; link: string | null; offer: string | null; message: string | null; lang: string; status: "new" | "done"; created_at: string }
interface Given { spot_id: string; name: string; logo: string | null; link: string | null }

const requests = signal<Req[] | null>(null);
const given = signal<Given[]>([]);
/** null until asked, false when the tables aren't there yet */
const ready = signal<boolean | null>(MOCK && new URLSearchParams(location.search).has("nofeatures") ? false : null);

export async function loadSponsors() {
  if (MOCK) {
    if (ready.value === false) return;
    requests.value = [
      { id: "r1", spot_id: "col-stag-saddle", spot_label: "Stag Saddle", name: "Kea Coffee", contact: "@keacoffee", link: "@keacoffee", offer: "250 NZD", message: "On adorerait le point le plus haut !", lang: "fr", status: "new", created_at: new Date(Date.now() - 3600e3).toISOString() },
      { id: "r2", spot_id: "km-120", spot_label: "Kilomètre 120", name: "Léa", contact: "lea@example.com", link: null, offer: "20 €", message: null, lang: "fr", status: "done", created_at: new Date(Date.now() - 86400e3).toISOString() },
    ];
    given.value = [{ spot_id: "km-120", name: "Léa", logo: null, link: null }];
    ready.value = true;
    return;
  }
  const [r, g] = await Promise.all([
    sba.from("sponsor_requests").select("id, spot_id, spot_label, name, contact, link, offer, message, lang, status, created_at").order("created_at", { ascending: false }).limit(300),
    sba.from("sponsor_spots").select("spot_id, name, logo, link").order("created_at", { ascending: false }),
  ]);
  if (r.error || g.error) {
    const m = `${r.error?.code ?? ""} ${r.error?.message ?? ""} ${g.error?.code ?? ""} ${g.error?.message ?? ""}`;
    if (/does not exist|schema cache|42P01|42703|PGRST20[45]/i.test(m)) ready.value = false;
    return;
  }
  ready.value = true;
  requests.value = r.data as Req[];
  given.value = g.data as Given[];
}

/** the home cell's line */
export function sponsorsLine(): string {
  if (ready.value === false) return "À activer";
  const l = requests.value;
  if (!l) return "Les demandes de sponsoring";
  const n = l.filter((r) => r.status === "new").length;
  const g = given.value.length;
  if (n) return `${n} ${n > 1 ? "nouvelles demandes" : "nouvelle demande"}`;
  return g ? `${g} ${g > 1 ? "emplacements attribués" : "emplacement attribué"}` : "Aucune demande pour l'instant";
}

const when = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** "@kea", "kea.co.nz", "http://…" → an https address (or null when it isn't one) */
export function normLink(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const h = /^@([A-Za-z0-9._]{1,30})$/.exec(v);
  if (h) return `https://www.instagram.com/${h[1]}`;
  if (/^https:\/\/\S+$/i.test(v)) return v;
  if (/^http:\/\/\S+$/i.test(v)) return v.replace(/^http:/i, "https:");
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return `https://${v}`;
  return null;
}

/** A logo picked on the phone, made a small square PNG (transparency kept) and sent to the media bucket. */
async function uploadLogo(file: File, spot: string): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const side = 400;
    const c = document.createElement("canvas");
    c.width = side; c.height = side;
    const x = c.getContext("2d")!;
    // the whole logo, centred on a white disc's square (the coin is round: a margin keeps corners out of the cut)
    const w = img.naturalWidth || side, h = img.naturalHeight || side;
    const k = (side * 0.8) / Math.max(w, h);
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, side, side);
    x.drawImage(img, (side - w * k) / 2, (side - h * k) / 2, w * k, h * k);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("image illisible"))), "image/png"));
    const path = `sponsors/${spot}-${Date.now()}.png`;
    if (MOCK) return path;
    const { error } = await sba.storage.from("media").upload(path, blob, { upsert: true, contentType: "image/png", cacheControl: "31536000" });
    if (error) throw error;
    return path;
  } finally { URL.revokeObjectURL(url); }
}

export function SponsorsAdminPage() {
  useEffect(() => { loadSponsors(); }, []);
  const list = requests.value;
  const labels = new Map((list ?? []).map((r) => [r.spot_id, r.spot_label]));
  const fresh = (list ?? []).filter((r) => r.status === "new"), done = (list ?? []).filter((r) => r.status === "done");

  if (ready.value === false) return <Setup />;
  return (
    <div class="adm">
      <Bar title="Sponsors" />
      <p class="adm-sub" style={{ marginTop: "12px" }}>Les demandes envoyées depuis la page « Parraine le sentier ». Toi seul les vois. « Attribuer » réserve le ticket sur le site, et le logo tourne en 3D sur la carte à cet endroit, avec le lien.</p>

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

/** The tables aren't there yet: how to create them from the phone. */
function Setup() {
  const [sql, setSql] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { import("virtual:activation").then((m) => setSql(m.SPONSORS_SQL)); }, []);
  const verify = async () => {
    setBusy(true);
    await loadSponsors();
    setBusy(false);
    say(ready.value ? "C'est actif : les demandes arrivent ici." : "Le script n'a pas encore été lancé.", 3200);
  };
  return (
    <div class="adm">
      <Bar title="Sponsors" />
      <p class="adm-sub" style={{ marginTop: "12px" }}>Pour recevoir les demandes de la page « Parraine le sentier », la base a besoin de ses deux tables. À faire une seule fois, depuis ton téléphone :</p>
      <ol class="adm-list adm-steps">
        <li>Copie le script : {sql ? <CopyBtn text={sql} what="Le script" /> : "…"}</li>
        <li>Sur supabase.com, ouvre ton projet, puis <strong>SQL Editor</strong> et <strong>New query</strong>.</li>
        <li>Colle le script et touche <strong>Run</strong>.</li>
        <li>Reviens ici et touche « Vérifier ».</li>
      </ol>
      <button class="bigbtn" type="button" disabled={busy} onClick={verify}>{busy ? "…" : "Vérifier"}</button>
    </div>
  );
}

function GiveForm({ spot, initial, onDone, onCancel }: { spot: string; initial: Given; onDone: (g: Given) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial.name);
  const [link, setLink] = useState(initial.link ?? "");
  const [logo, setLogo] = useState<string | null>(initial.logo);
  const [preview, setPreview] = useState<string | null>(initial.logo ? mediaUrl(initial.logo) : null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const path = await uploadLogo(f, spot);
      setLogo(path);
      setPreview(MOCK ? URL.createObjectURL(f) : mediaUrl(path));
      say("Logo envoyé. Touche « Enregistrer ».");
    } catch (e) { say(`Logo pas envoyé : ${(e as Error).message}`); }
    setBusy(false);
  };
  const save = async () => {
    const n = name.trim();
    if (!n) { say("Écris le nom à afficher."); return; }
    const l = link.trim() ? normLink(link) : null;
    if (link.trim() && !l) { say("Le lien n'est pas une adresse : @compte, site.com ou https://…"); return; }
    setBusy(true);
    const row: Given = { spot_id: spot, name: n, link: l, logo };
    const { error } = MOCK ? { error: null } : await sba.from("sponsor_spots").upsert(row);
    setBusy(false);
    if (error) { say("Pas enregistré : vérifie le réseau et réessaie."); return; }
    // the old logo, replaced, leaves the bucket
    if (initial.logo && initial.logo !== logo && !MOCK) sba.storage.from("media").remove([initial.logo]).catch(() => {});
    onDone(row);
  };

  return (
    <div class="spons__give">
      <label class="cell"><span>Nom affiché</span><input value={name} maxLength={60} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
      <label class="cell"><span>Lien</span><input value={link} maxLength={300} inputMode="url" autoCapitalize="none" placeholder="@compte ou site.com" onInput={(e) => setLink((e.target as HTMLInputElement).value)} /></label>
      <div class="cell">
        <span class="cell__main"><span class="cell__title">Logo</span><span class="cell__meta">{logo ? "Il tourne sur la carte à cet endroit." : "Sans logo, c'est son nom qui s'affiche."}</span></span>
        {preview && <img class="spons__logo" src={preview} alt="" width={44} height={44} />}
        <button class="textbtn" type="button" disabled={busy} onClick={() => file.current?.click()}>{logo ? "Changer" : "Choisir"}</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ""; }} />
      </div>
      <div class="spons__actions">
        <button class="textbtn" type="button" disabled={busy} onClick={onCancel}>Annuler</button>
        <span style={{ flex: 1 }} />
        <button class="textbtn textbtn--strong" type="button" disabled={busy} onClick={save}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}

function RequestCell({ r }: { r: Req }) {
  const [giving, setGiving] = useState(false);
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
  const remove = async () => {
    if (!window.confirm(`Supprimer la demande de ${r.name} ?`)) return;
    setBusy(true);
    const { error } = MOCK ? { error: null } : await sba.from("sponsor_requests").delete().eq("id", r.id);
    setBusy(false);
    if (error) { say("Pas supprimée : vérifie le réseau et réessaie."); return; }
    requests.value = (requests.value ?? []).filter((x) => x.id !== r.id);
  };
  const site = normLink(r.link);

  return (
    <div class="cell cell--stack spons">
      <div class="spons__head">
        <span class="cell__title">{r.spot_label}</span>
        <span class="cell__meta">{when(r.created_at)}{r.lang === "en" ? " · en anglais" : ""}</span>
      </div>
      <p class="spons__who"><b>{r.name}</b> · <button class="textbtn" type="button" onClick={copy}>{r.contact}</button></p>
      {r.offer && <p class="spons__offer">Prix proposé : <b>{r.offer}</b></p>}
      {r.link && <p class="spons__who">{site ? <a href={site} target="_blank" rel="noopener">{r.link}</a> : r.link}</p>}
      {r.message && <p class="spons__msg">{r.message}</p>}
      {isGiven && !giving && <p class="cell__meta">Ce ticket est attribué.</p>}
      {giving ? (
        <GiveForm spot={r.spot_id} initial={{ spot_id: r.spot_id, name: r.name, link: r.link ?? (/^@/.test(r.contact) ? r.contact : null), logo: null }}
          onCancel={() => setGiving(false)}
          onDone={(g) => {
            given.value = [g, ...given.value.filter((x) => x.spot_id !== g.spot_id)];
            setGiving(false);
            say(`${r.spot_label} attribué à ${g.name}.`);
            setStatus("done");
          }} />
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
  const [editing, setEditing] = useState(false);
  const free = async () => {
    if (!window.confirm(`Libérer « ${label} » ? Le ticket redevient libre sur le site et le logo quitte la carte.`)) return;
    setBusy(true);
    const { error } = MOCK ? { error: null } : await sba.from("sponsor_spots").delete().eq("spot_id", g.spot_id);
    setBusy(false);
    if (error) { say("Pas libéré : vérifie le réseau et réessaie."); return; }
    if (g.logo && !MOCK) sba.storage.from("media").remove([g.logo]).catch(() => {});
    given.value = given.value.filter((x) => x.spot_id !== g.spot_id);
    say(`« ${label} » est de nouveau libre.`);
  };
  if (editing) {
    return (
      <div class="cell cell--stack spons">
        <span class="cell__title">{label}</span>
        <GiveForm spot={g.spot_id} initial={g} onCancel={() => setEditing(false)}
          onDone={(n) => { given.value = given.value.map((x) => (x.spot_id === n.spot_id ? n : x)); setEditing(false); say("Enregistré."); }} />
      </div>
    );
  }
  return (
    <div class="cell">
      {g.logo && <img class="spons__logo" src={mediaUrl(g.logo)} alt="" width={36} height={36} />}
      <span class="cell__main"><span class="cell__title">{label}</span><span class="cell__meta">{g.name}{g.link ? ` · ${g.link.replace(/^https:\/\/(www\.)?/, "")}` : ""}</span></span>
      <button class="textbtn" type="button" disabled={busy} onClick={() => setEditing(true)}>Modifier</button>
      <button class="textbtn danger" type="button" disabled={busy} onClick={free}>Libérer</button>
    </div>
  );
}
