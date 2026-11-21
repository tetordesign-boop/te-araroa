// The Carnet's "Sponsors". Tickets bought on the site are given on their own once paid (the "checkout" function asks
// Stripe): here I see them, with their amount, and the rare one paid for a spot taken just before (to refund). Tickets
// asked for free wait for my yes: "Attribuer" gives the spot (name, link, logo, which then turns in 3D on the map).
// Then the gifts ("coups de pouce"), and the Stripe key that opens payments: pasted once, never shown again.
// Kept in supabase/migrations/20261120000100_sponsors.sql and 20261121000200_sponsor_checkout.sql. Until the first has
// run, this page says how to run it from the phone (copy, paste in Supabase, Run).
import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { MOCK, mediaUrl } from "../config";
import { isFreeOffer } from "../lib/offer";
import { Bar, CopyBtn } from "./Pages";
import { say } from "./nav";
import { sba } from "./sb";

interface Req {
  id: string; spot_id: string; spot_label: string; name: string; contact: string; link: string | null; offer: string | null; message: string | null;
  lang: string; kind: "ask" | "buy"; status: "new" | "done" | "pending" | "paid" | "expired" | "conflict";
  amount_cents: number | null; hold_until: string | null; paid_at: string | null; created_at: string;
}
interface Given { spot_id: string; name: string; logo: string | null; link: string | null }
interface GiftRow { id: string; amount_cents: number; currency: string; name: string | null; message: string | null; email: string | null; created_at: string }

const requests = signal<Req[] | null>(null);
const given = signal<Given[]>([]);
const gifts = signal<GiftRow[]>([]);
/** the Stripe key's ends ("rk_live_…ab12"), null when there's none, undefined until asked */
const stripeKey = signal<string | null | undefined>(undefined);
/** null until asked, false when the tables aren't there yet */
const ready = signal<boolean | null>(MOCK && new URLSearchParams(location.search).has("nofeatures") ? false : null);

export async function loadSponsors() {
  if (MOCK) {
    if (ready.value === false) return;
    const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
    const base = { contact: "@keacoffee", link: null, offer: null, message: null, lang: "fr", amount_cents: null, hold_until: null, paid_at: null };
    requests.value = [
      { ...base, id: "r4", spot_id: "col-stag-saddle", spot_label: "Stag Saddle", name: "Kea Coffee", link: "@keacoffee", message: "On adorerait le point le plus haut !", kind: "buy", status: "paid", amount_cents: 25000, paid_at: ago(1), created_at: ago(1.1) },
      { ...base, id: "r5", spot_id: "section-04", spot_label: "Boyle Village → Arthur's Pass", name: "Tūī Outdoors", contact: "hi@tui.example", kind: "buy", status: "pending", amount_cents: 8000, hold_until: new Date(Date.now() + 20 * 60e3).toISOString(), created_at: ago(0.2) },
      { ...base, id: "r6", spot_id: "km-1", spot_label: "Kilomètre 1", name: "Lucas", contact: "lucas@example.com", kind: "buy", status: "conflict", amount_cents: 1000, paid_at: ago(30), created_at: ago(30) },
      { ...base, id: "r3", spot_id: "km-2", spot_label: "Kilomètre 2", name: "Tom", contact: "@tom", offer: "0", message: "Pour le premier pas !", kind: "ask", status: "new", created_at: ago(0.1) },
      { ...base, id: "r2", spot_id: "km-120", spot_label: "Kilomètre 120", name: "Léa", contact: "lea@example.com", offer: "0", kind: "ask", status: "done", created_at: ago(24) },
    ];
    given.value = [{ spot_id: "col-stag-saddle", name: "Kea Coffee", logo: null, link: "https://www.instagram.com/keacoffee" }, { spot_id: "km-120", name: "Léa", logo: null, link: null }];
    gifts.value = [
      { id: "g1", amount_cents: 2000, currency: "eur", name: "Mamie Jo", message: "Bonne route mon grand !", email: null, created_at: ago(3) },
      { id: "g2", amount_cents: 500, currency: "eur", name: null, message: null, email: null, created_at: ago(50) },
    ];
    stripeKey.value = new URLSearchParams(location.search).has("nostripe") ? null : "rk_test_…mock";
    ready.value = true;
    return;
  }
  const [r, g, gf, k] = await Promise.all([
    sba.from("sponsor_requests").select("id, spot_id, spot_label, name, contact, link, offer, message, lang, kind, status, amount_cents, hold_until, paid_at, created_at").order("created_at", { ascending: false }).limit(300),
    sba.from("sponsor_spots").select("spot_id, name, logo, link").order("created_at", { ascending: false }),
    sba.from("gifts").select("id, amount_cents, currency, name, message, email, created_at").order("created_at", { ascending: false }).limit(200),
    sba.rpc("admin_stripe_key_hint"),
  ]);
  if (r.error || g.error) {
    const m = `${r.error?.code ?? ""} ${r.error?.message ?? ""} ${g.error?.code ?? ""} ${g.error?.message ?? ""}`;
    if (/does not exist|schema cache|42P01|42703|PGRST20[45]/i.test(m)) ready.value = false;
    return;
  }
  ready.value = true;
  requests.value = r.data as Req[];
  given.value = g.data as Given[];
  gifts.value = gf.error ? [] : (gf.data as GiftRow[]);
  stripeKey.value = k.error ? null : (k.data as string | null);
}

/** the home cell's line */
export function sponsorsLine(): string {
  if (ready.value === false) return "À activer";
  const l = requests.value;
  if (!l) return "Les demandes de sponsoring";
  const n = l.filter((r) => r.kind === "ask" && r.status === "new").length;
  const bought = l.filter((r) => r.kind === "buy" && r.status === "paid").length;
  const refund = l.filter((r) => r.status === "conflict").length;
  if (refund) return `${refund} paiement${refund > 1 ? "s" : ""} à rembourser`;
  if (n) return `${n} ${n > 1 ? "tickets gratuits demandés" : "ticket gratuit demandé"}`;
  if (bought || gifts.value.length) return [bought ? `${bought} ticket${bought > 1 ? "s" : ""} acheté${bought > 1 ? "s" : ""}` : null, gifts.value.length ? `${gifts.value.length} coup${gifts.value.length > 1 ? "s" : ""} de pouce` : null].filter(Boolean).join(", ");
  return stripeKey.value === null ? "Paiements à ouvrir" : "Rien pour l'instant";
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

const euro = (c: number | null) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format((c ?? 0) / 100)} €`;
const hour = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function SponsorsAdminPage() {
  useEffect(() => { loadSponsors(); }, []);
  const list = requests.value;
  const labels = new Map((list ?? []).map((r) => [r.spot_id, r.spot_label]));
  const asks = (list ?? []).filter((r) => r.kind !== "buy");
  const fresh = asks.filter((r) => r.status === "new"), done = asks.filter((r) => r.status !== "new");
  const buys = (list ?? []).filter((r) => r.kind === "buy" && r.status !== "expired").slice(0, 40);
  const total = gifts.value.reduce((n, g) => n + g.amount_cents, 0);

  if (ready.value === false) return <Setup />;
  return (
    <div class="adm">
      <Bar title="Sponsors" />
      <p class="adm-sub" style={{ marginTop: "12px" }}>Les tickets achetés sur le site sont attribués tout seuls dès le paiement : leur logo tourne sur la carte. Les tickets demandés gratuitement attendent ton accord ici. Toi seul vois cette page.</p>
      <StripeBox />

      <div class="group__title">Tickets gratuits demandés</div>
      <div class="group">
        {list === null && <div class="cell"><span class="cell__meta">Chargement…</span></div>}
        {list && !fresh.length && <div class="cell"><span class="cell__meta">Rien de nouveau.</span></div>}
        {fresh.map((r) => <RequestCell r={r} />)}
      </div>

      <div class="group__title">Achats</div>
      <div class="group">
        {list && !buys.length && <div class="cell"><span class="cell__meta">Aucun achat pour l'instant.</span></div>}
        {buys.map((r) => <BuyCell r={r} />)}
      </div>

      <div class="group__title">Coups de pouce{total ? `, ${euro(total)} en tout` : ""}</div>
      <div class="group">
        {!gifts.value.length && <div class="cell"><span class="cell__meta">Aucun pour l'instant.</span></div>}
        {gifts.value.map((g) => <GiftCell g={g} />)}
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

/** The key that opens payments: a Stripe restricted key, pasted once (kept in the database, never shown again). */
function StripeBox() {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    const { data, error } = MOCK ? { data: { ok: true }, error: null } : await sba.functions.invoke("checkout", { body: { action: "check" } });
    setBusy(false);
    if (!error && (data as { ok?: boolean })?.ok) { say("La clé marche : les achats et les dons sont ouverts.", 3200); return; }
    const ctx = (error as { context?: Response } | null)?.context;
    const body = ctx ? await ctx.json().catch(() => ({})) : {};
    say(body?.detail === "key" ? "Stripe refuse cette clé : vérifie qu'elle a « Checkout Sessions : Écriture »." : body?.error === "not_configured" ? "Pas encore de clé." : "Pas pu vérifier : réessaie avec du réseau.", 4200);
  };
  const save = async () => {
    const key = v.trim();
    if (!/^(rk|sk)_(live|test)_[A-Za-z0-9]{20,250}$/.test(key)) { say("Ce n'est pas une clé Stripe : elle commence par rk_live_…", 3600); return; }
    setBusy(true);
    const { data, error } = MOCK ? { data: `${key.slice(0, 8)}…${key.slice(-4)}`, error: null } : await sba.rpc("admin_set_stripe_key", { p_key: key });
    setBusy(false);
    if (error) { say("Pas enregistrée : vérifie le réseau et réessaie."); return; }
    stripeKey.value = data as string;
    setV("");
    setEditing(false);
    say(key.startsWith("sk_") ? "Clé enregistrée. Une clé restreinte (rk_) serait plus sûre." : "Clé enregistrée : je vérifie qu'elle marche…", 3000);
    void check();
  };
  const sweep = async () => {
    setBusy(true);
    const { data, error } = MOCK ? { data: { given: 0, expired: 0 }, error: null } : await sba.functions.invoke("checkout", { body: { action: "sweep" } });
    setBusy(false);
    if (error) { say("Pas pu vérifier : réessaie avec du réseau."); return; }
    const d = data as { given: number; expired: number };
    say(d.given ? `${d.given} ticket${d.given > 1 ? "s" : ""} payé${d.given > 1 ? "s" : ""} attribué${d.given > 1 ? "s" : ""}.` : "Rien en attente.", 3000);
    await loadSponsors();
  };
  const k = stripeKey.value;
  return (
    <>
      <div class="group__title">Paiements</div>
      <div class="group">
        {!editing ? (
          <div class="cell">
            <span class="cell__main">
              <span class="cell__title">Clé Stripe</span>
              <span class="cell__meta">{k === undefined ? "…" : k ? `${k} · achats et dons ouverts` : "Pas encore de clé : les achats et les dons sont fermés sur le site."}</span>
            </span>
            <button class="textbtn" type="button" onClick={() => setEditing(true)}>{k ? "Changer" : "Ajouter"}</button>
          </div>
        ) : (
          <div class="cell cell--stack spons">
            <label class="cell"><span>Clé</span><input type="password" value={v} autoComplete="off" autoCapitalize="none" spellcheck={false} placeholder="rk_live_…" onInput={(e) => setV((e.target as HTMLInputElement).value)} /></label>
            <p class="cell__meta" style={{ margin: "2px 0 0" }}>Elle reste dans ta base, protégée : personne ne peut la relire, même ici.</p>
            <div class="spons__actions">
              <button class="textbtn" type="button" disabled={busy} onClick={() => { setEditing(false); setV(""); }}>Annuler</button>
              <span style={{ flex: 1 }} />
              <button class="textbtn textbtn--strong" type="button" disabled={busy || !v.trim()} onClick={save}>{busy ? "…" : "Enregistrer"}</button>
            </div>
          </div>
        )}
        {k && !editing && (
          <div class="cell">
            <span class="cell__main"><span class="cell__title">Vérifier</span><span class="cell__meta">La clé, et les tickets payés par quelqu'un qui a fermé la page trop vite</span></span>
            <button class="textbtn" type="button" disabled={busy} onClick={check}>La clé</button>
            <button class="textbtn" type="button" disabled={busy} onClick={sweep}>Les paiements</button>
          </div>
        )}
      </div>
    </>
  );
}

/** A ticket bought on the site: given on its own once paid; the rare one paid for a spot just taken is mine to refund. */
function BuyCell({ r }: { r: Req }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!window.confirm(`Effacer l'achat de ${r.name} de la liste ? (ça ne touche ni Stripe, ni le ticket)`)) return;
    setBusy(true);
    const { error } = MOCK ? { error: null } : await sba.from("sponsor_requests").delete().eq("id", r.id);
    setBusy(false);
    if (error) { say("Pas effacé : vérifie le réseau et réessaie."); return; }
    requests.value = (requests.value ?? []).filter((x) => x.id !== r.id);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(r.contact); say("Contact copié"); } catch { say("Copie impossible : sélectionne le texte et copie-le."); }
  };
  const line = r.status === "paid" ? <span class="spons__paid">Payé {euro(r.amount_cents)}{r.paid_at ? ` le ${when(r.paid_at)}` : ""} · attribué tout seul</span>
    : r.status === "conflict" ? <span class="spons__refund">Payé {euro(r.amount_cents)}, mais le ticket venait d'être pris : rembourse-le dans l'app Stripe (Paiements, ce paiement, Rembourser), puis efface-le ici.</span>
    : <span class="cell__meta">Sur la page de paiement ({euro(r.amount_cents)}){r.hold_until ? `, réservé jusqu'à ${hour(r.hold_until)}` : ""}</span>;
  return (
    <div class="cell cell--stack spons">
      <div class="spons__head">
        <span class="cell__title">{r.spot_label}</span>
        <span class="cell__meta">{when(r.created_at)}{r.lang === "en" ? " · en anglais" : ""}</span>
      </div>
      <p class="spons__who"><b>{r.name}</b> · <button class="textbtn" type="button" onClick={copy}>{r.contact}</button></p>
      {r.message && <p class="spons__msg">{r.message}</p>}
      <div class="spons__pay">{line}</div>
      {r.status !== "paid" && (
        <div class="spons__actions">
          <span style={{ flex: 1 }} />
          <button class="textbtn danger" type="button" disabled={busy} onClick={remove}>Effacer</button>
        </div>
      )}
    </div>
  );
}

function GiftCell({ g }: { g: GiftRow }) {
  return (
    <div class="cell cell--stack spons">
      <div class="spons__head">
        <span class="cell__title">{euro(g.amount_cents)}{g.name ? `, ${g.name}` : ""}</span>
        <span class="cell__meta">{when(g.created_at)}</span>
      </div>
      {g.message && <p class="spons__msg">{g.message}</p>}
      {g.email && <p class="cell__meta">{g.email}</p>}
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
      <p class="spons__offer">{isFreeOffer(r.offer) ? "Ticket demandé gratuitement" : <>Prix proposé : <b>{r.offer}</b></>}</p>
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
