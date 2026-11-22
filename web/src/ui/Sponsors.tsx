// "Les tickets du sentier": sponsor a piece of my Te Araroa. On the trail you pay the huts with tickets, so here each
// spot is one. The whole trail is drawn as its skyline (the elevation profile): a finger slides along it, an orange
// cursor follows with the km, the place and the height, and snaps to a pass when near one; let go and a ticket comes
// out of the slot below, foil catching the light. "Je veux ce ticket" opens a small form inside it: a price, and the
// payment goes straight to Stripe (the ticket is given as soon as it's paid); or, with no budget, a request I answer.
// Below the skyline, the tickets that aren't a point on it: start and finish, the passes and sections in a row each.
// At the foot, "un coup de pouce": a gift of the amount chosen, for those who just want to help.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { fmtInt } from "../lib/format";
import { profile } from "../lib/places";
import { play } from "../lib/sound";
import {
  buySpot, cols, confirmPayment, ends, giveGift, GIFT_EUR, heightAt, kmSpot, linkLabel, loadTaken, logoSrc, MAX_EUR, MIN_EUR, nearKm,
  requestSpot, sections, sweepPayments, taken, totalKm, type Paid, type Spot, type SpotKind } from "../lib/sponsors";
import type { Lang } from "../types";
import { ChevronRight } from "./icons";
import { PageHead } from "./Pages";
import { route } from "../lib/data";
import { go, hrefFor, isDesktop, mapApi } from "./state";

// ------------------------------------------------------------------ words (first person; place names stay as they are)
const W = {
  fr: {
    lead: "Je marche 1 334 km, de Ship Cove à Bluff. Chaque kilomètre, chaque col, chaque section peut porter ton nom ou celui de ta marque, au prix que tu choisis. Sur le sentier, on paie les refuges avec des tickets : ici, chaque emplacement en est un.",
    hint: "Fais glisser ton doigt sur le sentier",
    hintKeys: "Flèches pour avancer, Entrée pour prendre le ticket",
    kind: { km: "Kilomètre", col: "Col", section: "Section", end: "Départ et arrivée" } as Record<SpotKind, string>,
    decks: { end: "Le départ et l'arrivée", col: "Les cols", section: "Les sections" } as Record<string, string>,
    gets: {
      km: "Ton nom ou ton logo sur la carte à ce kilomètre. Et quand j'y passe, je t'envoie une photo de l'endroit.",
      col: "Ton logo en 3D sur la carte interactive, au col, avec le lien vers ton site ou ton Insta. Et dans l'épisode où je le passe : « ce col vous est présenté par… ».",
      section: "Ton logo en 3D sur la carte au milieu de la section, avec ton lien, et sur l'écran titre de son épisode.",
      end: "Ton logo en 3D sur la carte à cet endroit, avec ton lien, dans le teaser et dans le film de la fin.",
    } as Record<SpotKind, string>,
    near: "près de", highest: "le point le plus haut du sentier", from: (a: string, b: string) => `du km ${a} au km ${b}`,
    free: "Libre", takenBy: "Réservé", asked: "Demandé",
    want: "Je veux ce ticket", gone: "Déjà réservé",
    who: "Ton nom ou ta marque", contact: "Pour te joindre", contactHint: "e-mail ou Instagram", msg: "Un mot", msgHint: "facultatif",
    visit: "Voir",
    link: "Ton site ou ton Insta", linkHint: "pour le lien sous ton logo", logo: "Ton logo", logoHint: "facultatif, carré de préférence", logoPick: "Choisir une image", logoChange: "Changer",
    price: "Ton prix", priceHint: `à partir de ${MIN_EUR} €`,
    askFree: "Pas de budget : je demande ce ticket gratuitement", askFreeHint: "sur accord, je te réponds",
    pay: (n: string) => `Payer ${n} €`, send: "Envoyer la demande", sending: "Un instant…", cancel: "Annuler",
    secure: "Paiement sécurisé par Stripe : carte, Apple Pay ou Google Pay. Tu peux encore changer le montant sur la page de paiement. Le ticket est à toi dès que c'est payé.",
    needWho: "Écris ton nom ou celui de ta marque.", needContact: "Laisse-moi un moyen de te joindre.", needPrice: `Le prix commence à ${MIN_EUR} €.`, badLogo: "Ce fichier n'est pas une image.",
    err: {
      rate: "Trop de demandes d'un coup : réessaie dans quelques minutes.", links: "Un seul lien par message, s'il te plaît.",
      taken: "Quelqu'un vient de le prendre : choisis-en un autre.", held: "Quelqu'un est en train de le payer : choisis-en un autre, ou réessaie dans une demi-heure.",
      closed: "Le paiement n'est pas encore ouvert : réessaie bientôt.", error: "Ça n'est pas parti : vérifie ta connexion et réessaie.",
    } as Record<string, string>,
    thanksFree: "C'est noté, merci ! Je te réponds dès que j'ai du réseau.",
    checking: "Je vérifie le paiement…",
    paidTitle: "Paiement reçu, merci !",
    paidTicket: (label: string) => `Le ticket « ${label} » est à toi : ton nom est déjà sur la carte, et tu passes dans la vidéo quand j'y arrive.`,
    paidConflict: "Quelqu'un a pris ce ticket juste avant toi. Je te contacte pour t'en proposer un autre ou te rembourser.",
    paidUnpaid: "Le paiement n'est pas encore confirmé. Si tu as payé, ton ticket arrive dans quelques minutes.",
    paidGift: (n: string) => `Merci pour ce coup de pouce de ${n} € ! Ça m'aide vraiment sur le sentier.`,
    how: "Comment ça marche",
    steps: [`Tu choisis ton ticket et ton prix, à partir de ${MIN_EUR} €.`, "Tu paies en sécurité avec Stripe : carte, Apple Pay ou Google Pay.", "Le ticket est à toi tout de suite : ton logo tourne en 3D sur la carte avec ton lien, puis tu passes dans les vidéos quand j'y arrive."],
    freeNote: "Pas de budget ? Tu peux aussi demander un ticket gratuitement : je te réponds.",
    counts: (free: number) => `${free} tickets libres, sans compter les kilomètres`,
    gift: {
      title: "Un coup de pouce",
      lead: "Pas besoin de ticket pour m'aider : si tu veux juste me soutenir, choisis un montant. Ça m'aide pour les repas, les refuges et le matériel en route.",
      other: "Autre", otherLabel: "Autre montant, en euros", name: "Ton prénom", word: "Un mot pour moi", optional: "facultatif",
      give: (n: string) => `Donner ${n} €`, pick: "Choisis un montant", tooSmall: "Le montant commence à 1 €.",
    },
  },
  en: {
    lead: "I'm walking 1,334 km, from Ship Cove to Bluff. Every kilometre, every pass, every section can carry your name or your brand's, at the price you choose. On the trail you pay for huts with tickets: here, every spot is one.",
    hint: "Slide your finger along the trail",
    hintKeys: "Arrow keys to move, Enter to take the ticket",
    kind: { km: "Kilometre", col: "Pass", section: "Section", end: "Start and finish" } as Record<SpotKind, string>,
    decks: { end: "The start and the finish", col: "The passes", section: "The sections" } as Record<string, string>,
    gets: {
      km: "Your name or logo on the map at this kilometre. And when I walk through it, I send you a photo of the spot.",
      col: "Your logo in 3D on the interactive map, at the pass, with a link to your site or Instagram. And in the episode where I cross it: “this pass is brought to you by…”.",
      section: "Your logo in 3D on the map in the middle of the section, with your link, and on its episode's title card.",
      end: "Your logo in 3D on the map at this spot, with your link, in the teaser and in the final film.",
    } as Record<SpotKind, string>,
    near: "near", highest: "the highest point of the trail", from: (a: string, b: string) => `from km ${a} to km ${b}`,
    free: "Free", takenBy: "Taken", asked: "Requested",
    want: "I want this ticket", gone: "Already taken",
    who: "Your name or your brand", contact: "How to reach you", contactHint: "email or Instagram", msg: "A word", msgHint: "optional",
    visit: "Visit",
    link: "Your website or Instagram", linkHint: "for the link under your logo", logo: "Your logo", logoHint: "optional, square if you can", logoPick: "Choose an image", logoChange: "Change",
    price: "Your price", priceHint: `from €${MIN_EUR}`,
    askFree: "No budget: I'm asking for this ticket for free", askFreeHint: "if I agree, I'll get back to you",
    pay: (n: string) => `Pay €${n}`, send: "Send the request", sending: "One moment…", cancel: "Cancel",
    secure: "Secure payment by Stripe: card, Apple Pay or Google Pay. You can still change the amount on the payment page. The ticket is yours as soon as it's paid.",
    needWho: "Write your name or your brand's.", needContact: "Leave me a way to reach you.", needPrice: `The price starts at €${MIN_EUR}.`, badLogo: "That file isn't an image.",
    err: {
      rate: "Too many requests at once: try again in a few minutes.", links: "One link per message, please.",
      taken: "Someone just took it: pick another one.", held: "Someone is paying for it right now: pick another one, or try again in half an hour.",
      closed: "Payments aren't open yet: try again soon.", error: "It didn't go through: check your connection and try again.",
    } as Record<string, string>,
    thanksFree: "Got it, thank you! I'll get back to you as soon as I have signal.",
    checking: "Checking the payment…",
    paidTitle: "Payment received, thank you!",
    paidTicket: (label: string) => `The “${label}” ticket is yours: your name is already on the map, and you're in the video when I get there.`,
    paidConflict: "Someone took this ticket just before you. I'll contact you to offer another one or refund you.",
    paidUnpaid: "The payment isn't confirmed yet. If you paid, your ticket arrives in a few minutes.",
    paidGift: (n: string) => `Thank you for this €${n} boost! It really helps on the trail.`,
    how: "How it works",
    steps: [`You pick your ticket and your price, from €${MIN_EUR}.`, "You pay securely with Stripe: card, Apple Pay or Google Pay.", "The ticket is yours at once: your logo spins in 3D on the map with your link, then you're in the videos when I get there."],
    freeNote: "No budget? You can also ask for a ticket for free: I'll get back to you.",
    counts: (free: number) => `${free} free tickets, not counting the kilometres`,
    gift: {
      title: "A helping hand",
      lead: "No ticket needed to help: if you'd just like to support me, pick an amount. It goes to meals, huts and gear along the way.",
      other: "Other", otherLabel: "Another amount, in euros", name: "Your first name", word: "A word for me", optional: "optional",
      give: (n: string) => `Give €${n}`, pick: "Pick an amount", tooSmall: "The amount starts at €1.",
    },
  },
};
const words = () => W[lang.value];
/** the label at the top of a ticket: for the two ends, which end it is */
const kindOf = (s: Spot, l: Lang) => s.kind !== "end" ? W[l].kind[s.kind] : s.id === "depart" ? (l === "fr" ? "Départ" : "Start") : (l === "fr" ? "Arrivée" : "Finish");

// ------------------------------------------------------------------ the way in
export function SponsorsRow({ block }: { block?: boolean }) {
  return (
    <div class={block ? "rows block" : "rows"}>
      <a class="row" href={hrefFor({ name: "sponsors" })} onClick={(e) => { e.preventDefault(); go({ name: "sponsors" }); }}>
        <span class="row__thumb row__thumb--empty tk-thumb" aria-hidden="true"><TicketIcon /></span>
        <span class="row__main">
          <span class="row__title">{t("sponsors")}</span>
          <span class="row__meta">{t("sponsorsMeta")}</span>
        </span>
        <ChevronRight class="row__chev" />
      </a>
    </div>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />
      <path d="M14.5 6.5v11" stroke-dasharray="1.6 2.2" />
    </svg>
  );
}

// ------------------------------------------------------------------ the page
const fmtK = (km: number, l: Lang) => fmtInt(Math.round(km), l);

export function SponsorsPage({ paid }: { paid?: boolean }) {
  const l = lang.value, w = words();
  const [sel, setSel] = useState<Spot | null>(null);
  const [printed, setPrinted] = useState(0); // a new print each time, even of the same ticket
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => { loadTaken(true); void sweepPayments(); }, []);

  const pick = (s: Spot, scroll = false) => {
    setSel(s);
    setPrinted((n) => n + 1);
    play("open");
    // beside the panel, the map goes there too (on a phone it's under the page)
    const m = mapApi.value, r = route.value;
    if (m && isDesktop.value && s.km !== undefined) {
      if (s.km2 !== undefined) { m.showStretch(s.km, s.km2); m.fitPlaces([r.pointAt(s.km), r.pointAt((s.km + s.km2) / 2), r.pointAt(s.km2)]); }
      else m.flyToPlace(r.pointAt(s.km), r, s.km, s.kind === "col" ? "pass" : undefined);
    }
    if (scroll) requestAnimationFrame(() => slot.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }));
  };

  const decks: [string, Spot[]][] = [["end", ends.value], ["col", cols.value], ["section", sections.value]];
  const freeCount = decks.reduce((n, [, list]) => n + list.filter((s) => !taken.value.has(s.id)).length, 0);

  return (
    <div class="page spage">
      <PageHead title={t("sponsors")} />
      {paid && <PaidBanner />}
      <p class="spage__lead voice">{w.lead}</p>

      <Ridge onPick={(s) => pick(s, true)} selected={sel} />

      <div class="tk-slot" ref={slot} aria-live="polite">
        <span class="tk-slot__mouth" aria-hidden="true" />
        <div class="tk-slot__paper">{sel && <Ticket key={`${sel.id}-${printed}`} spot={sel} />}</div>
      </div>

      <p class="fine spage__count">{w.counts(freeCount)}</p>
      {decks.map(([key, list]) => list.length > 0 && (
        <section class="tk-deck" aria-labelledby={`deck-${key}`}>
          <div class="tk-deck__head">
            <h2 class="h-section" id={`deck-${key}`}>{w.decks[key]}</h2>
          </div>
          <div class="tk-deck__row">
            {list.map((s) => <MiniTicket s={s} on={sel?.id === s.id} onPick={() => pick(s, true)} />)}
          </div>
        </section>
      ))}

      <section class="block" aria-labelledby="tk-how">
        <h2 class="h-section" id="tk-how">{w.how}</h2>
        <ol class="tk-steps">{w.steps.map((s) => <li>{s}</li>)}</ol>
        <p class="fine" style={{ marginTop: "10px" }}>{w.freeNote}</p>
      </section>

      <Gift />

      <p class="fine block" style={{ marginTop: "20px" }}>{l === "fr" ? "Le tracé, les cols et les altitudes viennent des données du site (OpenStreetMap)." : "The route, passes and heights come from the site's data (OpenStreetMap)."}</p>
    </div>
  );
}

/** Back from Stripe: the server asks Stripe what was paid, gives the ticket if it was one, and says so. */
function PaidBanner() {
  const l = lang.value, w = words();
  const [res, setRes] = useState<Paid | "checking">("checking");
  useEffect(() => {
    let cs: string | null = null;
    try { cs = sessionStorage.getItem("ta-cs"); } catch (_) { /* private mode */ }
    if (!cs) { setRes(null); return; }
    let live = true, tries = 0;
    const ask = async () => {
      const r = await confirmPayment(cs!);
      if (!live) return;
      // (the payment can take a few seconds to settle: asked again a few times)
      if (r && r.status === "unpaid" && ++tries < 4) { window.setTimeout(ask, 2500); return; }
      setRes(r);
      if (r && r.status !== "unpaid") { try { sessionStorage.removeItem("ta-cs"); } catch (_) { /* ignore */ } }
      if (r?.kind === "ticket") loadTaken(true);
      if (r && r.status === "paid") play("signed");
    };
    void ask();
    return () => { live = false; };
  }, []);
  const euros = (c?: number) => fmtInt(Math.round((c ?? 0) / 100), l);
  const text = res === "checking" ? w.checking
    : !res ? w.paidUnpaid
    : res.kind === "gift" ? (res.status === "paid" ? w.paidGift(euros(res.amount)) : w.paidUnpaid)
    : res.status === "paid" ? w.paidTicket(res.label ?? "") : res.status === "conflict" ? w.paidConflict : w.paidUnpaid;
  const done = res !== "checking" && !!res && res.status !== "unpaid";
  const ticketPaid = res !== "checking" && !!res && res.kind === "ticket";
  return (
    <div class={`tk-paid${done ? "" : " is-waiting"}`} role="status">
      {done && <span class="tk-paid__stamp" aria-hidden="true">{l === "fr" ? "Payé" : "Paid"}</span>}
      <p>{done && ticketPaid && <b>{w.paidTitle} </b>}{text}</p>
    </div>
  );
}

/** "Un coup de pouce": a gift of the amount chosen, paid on Stripe. */
function Gift() {
  const l = lang.value, w = words().gift;
  const [amount, setAmount] = useState<number | "other">(GIFT_EUR[1]);
  const [other, setOther] = useState("");
  const [name, setName] = useState("");
  const [word, setWord] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error"; msg?: string }>({ kind: "idle" });
  const euros = amount === "other" ? Math.round(parseFloat(other.replace(",", ".")) || 0) : amount;
  const submit = async (e: Event) => {
    e.preventDefault();
    if (state.kind === "sending") return;
    if (!(euros >= 1)) { setState({ kind: "error", msg: w.tooSmall }); return; }
    setState({ kind: "sending" });
    const url = await giveGift(Math.min(euros, MAX_EUR), name.trim(), word.trim(), l);
    if (typeof url === "string" && url !== "closed") { location.href = url; return; }
    setState({ kind: "error", msg: words().err[url === "closed" ? "closed" : "error"] });
  };
  return (
    <section class="block gift" aria-labelledby="gift-title">
      <h2 class="h-section" id="gift-title">{w.title}</h2>
      <p class="gift__lead voice">{w.lead}</p>
      <form class="form gift__form" onSubmit={submit} noValidate>
        <div class="gift__amounts" role="radiogroup" aria-label={w.pick}>
          {GIFT_EUR.map((n) => (
            <button type="button" role="radio" aria-checked={amount === n} class={`gift__amount num${amount === n ? " is-on" : ""}`} data-sfx="tap" onClick={() => setAmount(n)}>
              {l === "fr" ? `${n} €` : `€${n}`}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={amount === "other"} class={`gift__amount${amount === "other" ? " is-on" : ""}`} data-sfx="tap" onClick={() => setAmount("other")}>{w.other}</button>
        </div>
        {amount === "other" && (
          <>
            <label class="note__label" for="gift-other">{w.otherLabel}</label>
            <input id="gift-other" class="field num" type="number" inputMode="numeric" min={1} max={MAX_EUR} step={1} value={other} onInput={(e) => setOther((e.target as HTMLInputElement).value)} />
          </>
        )}
        <label class="note__label" for="gift-name">{w.name} <span class="tk__hint">({w.optional})</span></label>
        <input id="gift-name" class="field" type="text" maxLength={60} autoComplete="given-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <label class="note__label" for="gift-word">{w.word} <span class="tk__hint">({w.optional})</span></label>
        <textarea id="gift-word" class="field" rows={2} maxLength={300} value={word} onInput={(e) => setWord((e.target as HTMLTextAreaElement).value)} />
        <button class="btn btn--primary btn--block" type="submit" data-sfx="none" disabled={state.kind === "sending" || !(euros >= 1)}>
          {state.kind === "sending" ? words().sending : w.give(fmtInt(euros || 0, l))}
        </button>
        <p class="fine gift__secure">{l === "fr" ? "Paiement sécurisé par Stripe : carte, Apple Pay ou Google Pay." : "Secure payment by Stripe: card, Apple Pay or Google Pay."}</p>
        <p class={state.kind === "error" ? "form__msg is-error" : "sr-only"} role="status" aria-live="polite">{state.kind === "error" ? state.msg : ""}</p>
      </form>
    </section>
  );
}

// ------------------------------------------------------------------ the skyline
const VW = 1000, VH = 200, TOP = 18;

function Ridge({ onPick, selected }: { onPick: (s: Spot) => void; selected: Spot | null }) {
  const l = lang.value, w = words();
  const total = totalKm.value;
  const prof = profile.value;
  const plot = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState<number | null>(null); // km under the finger
  const dragging = useRef(false);
  const [isDrag, setIsDrag] = useState(false);
  const lastSection = useRef(-1);
  const maxE = 2000;
  const y = (e: number) => TOP + (VH - TOP) * (1 - Math.max(0, e) / maxE);

  // the silhouette: the highest point of each slice, so no pass is lost
  const shape = useMemo(() => {
    if (!prof?.e.length) return null;
    const n = 360, per = prof.e.length / n;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = Math.floor(i * per); j < Math.min(prof.e.length, Math.floor((i + 1) * per)); j++) m = Math.max(m, prof.e[j]);
      pts.push([(i + 0.5) / n * VW, y(m)]);
    }
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    return { line, area: `${line}L${VW},${VH}L0,${VH}Z` };
  }, [prof]);

  const colList = cols.value, secList = sections.value, highest = Math.max(...colList.map((c) => c.alt ?? 0));
  const xOf = (km: number) => (km / total) * 100;
  const kmAt = (clientX: number) => {
    const r = plot.current!.getBoundingClientRect();
    return Math.min(total, Math.max(1, Math.ceil(((clientX - r.left) / r.width) * total)));
  };
  // near a pass, the cursor holds on to it
  const colNear = (k: number) => colList.find((c) => Math.abs((c.km ?? 0) - k) <= Math.max(3, total * 0.004)) ?? null;
  const spotAt = (k: number): Spot => colNear(k) ?? kmSpot(k);

  const move = (k: number) => {
    setCur(k);
    const si = secList.findIndex((s) => k > (s.km ?? 0) && k <= (s.km2 ?? 0));
    if (si !== lastSection.current) { if (lastSection.current !== -1) play("tap", 0.9 + (si % 5) * 0.06); lastSection.current = si; }
  };
  const down = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true; setIsDrag(true);
    move(kmAt(e.clientX));
  };
  const drag = (e: PointerEvent) => { if (dragging.current) move(kmAt(e.clientX)); };
  const up = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false; setIsDrag(false);
    onPick(spotAt(kmAt(e.clientX)));
  };
  const key = (e: KeyboardEvent) => {
    const k0 = cur ?? Math.round(total / 2);
    const step = e.shiftKey ? 10 : 1;
    let k = k0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") k = k0 + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") k = k0 - step;
    else if (e.key === "PageUp") k = k0 + 50;
    else if (e.key === "PageDown") k = k0 - 50;
    else if (e.key === "Home") k = 1;
    else if (e.key === "End") k = total;
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(spotAt(k0)); return; }
    else return;
    e.preventDefault();
    move(Math.min(total, Math.max(1, k)));
  };

  // what the readout says: the pass it holds on to, or the km and what it's near
  const shown = cur ?? (selected?.kind === "km" || selected?.kind === "col" ? selected.km ?? null : null);
  let readout = w.hint;
  if (shown !== null) {
    const c = colNear(shown);
    const h = c?.alt ?? heightAt(shown);
    if (c) readout = `${c.name[l]} · km ${fmtK(c.km ?? 0, l)}${h ? ` · ${fmtInt(h, l)} m` : ""}`;
    else { const n = nearKm(shown); readout = `km ${fmtK(shown, l)}${n ? ` · ${w.near} ${n}` : ""}${h !== null ? ` · ${fmtInt(h, l)} m` : ""}`; }
  }
  const cursorKm = shown !== null ? (colNear(shown)?.km ?? shown) : null;
  const tk = taken.value;
  const takenKms = [...tk.keys()].map((id) => /^km-(\d+)$/.exec(id)).filter(Boolean).map((m) => +m![1]);

  return (
    <section class="ridge" aria-label={l === "fr" ? "Le sentier en relief" : "The trail's skyline"}>
      <p class={`ridge__readout num${shown !== null ? " is-on" : ""}`} aria-hidden="true">{readout}</p>
      <div ref={plot} class={`ridge__plot${isDrag ? " is-drag" : ""}`} role="slider" tabIndex={0}
        aria-label={w.hint} aria-valuemin={1} aria-valuemax={total} aria-valuenow={cur ?? undefined} aria-valuetext={readout}
        aria-describedby="ridge-keys"
        onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={() => { dragging.current = false; setIsDrag(false); }} onKeyDown={key}
        onBlur={() => !dragging.current && setCur(null)}>
        <svg class="ridge__svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="ridge-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#5CD6E6" stop-opacity="0.34" />
              <stop offset="0.55" stop-color="#5CD6E6" stop-opacity="0.08" />
              <stop offset="1" stop-color="#5CD6E6" stop-opacity="0" />
            </linearGradient>
          </defs>
          {shape && <path class="ridge__area" d={shape.area} fill="url(#ridge-fill)" />}
          {shape && <path class="ridge__line" d={shape.line} />}
        </svg>
        {takenKms.map((k) => <span class="ridge__tick" style={{ left: `${xOf(k)}%` }} />)}
        {colList.map((c) => (
          <span class={`ridge__col${tk.has(c.id) ? " is-taken" : ""}${c.alt === highest ? " is-top" : ""}${selected?.id === c.id ? " is-sel" : ""}`}
            style={{ left: `${xOf(c.km ?? 0)}%`, top: `${(y(c.alt ?? 0) / VH) * 100}%` }} />
        ))}
        {cursorKm !== null && <span class="ridge__cursor" style={{ left: `${xOf(cursorKm)}%` }} />}
      </div>
      <div class="ridge__bands" role="group" aria-label={w.decks.section}>
        {secList.map((s, i) => (
          <button type="button" class={`ridge__band${i % 2 ? " is-odd" : ""}${tk.has(s.id) ? " is-taken" : ""}${selected?.id === s.id ? " is-sel" : ""}`}
            style={{ flexGrow: (s.km2 ?? 0) - (s.km ?? 0) }} aria-label={s.name[l]} data-sfx="none" onClick={() => onPick(s)} />
        ))}
      </div>
      <div class="ridge__ends fine" aria-hidden="true"><span>Ship Cove · km 0</span><span>Bluff · km {fmtInt(total, l)}</span></div>
      <p class="sr-only" id="ridge-keys">{w.hintKeys}</p>
    </section>
  );
}

// ------------------------------------------------------------------ tickets
/** a ticket number: the km for a kilometre, else a steady number made from its name */
function serial(s: Spot): string {
  if (s.kind === "km") return String(s.km).padStart(4, "0");
  let h = 7;
  for (const c of s.id) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return String(h).padStart(4, "0");
}

function metaOf(s: Spot, l: Lang): string {
  const w = W[l];
  const len = (s.km2 ?? 0) - (s.km ?? 0);
  switch (s.kind) {
    case "km": { const n = nearKm(s.km ?? 0), h = heightAt(s.km ?? 0); return [n ? `${w.near} ${n}` : null, h !== null ? `${fmtInt(h, l)} m` : null].filter(Boolean).join(" · "); }
    case "col": { const top = (s.alt ?? 0) >= Math.max(...cols.value.map((c) => c.alt ?? 0)); return [`km ${fmtK(s.km ?? 0, l)}`, s.alt ? `${fmtInt(s.alt, l)} m` : null, top ? w.highest : null].filter(Boolean).join(" · "); }
    case "section": return `${fmtK(len, l)} km · ${w.from(fmtK(s.km ?? 0, l), fmtK(s.km2 ?? 0, l))}`;
    case "end": return `km ${fmtK(s.km ?? 0, l)}`;
    default: return "";
  }
}

function MiniTicket({ s, on, onPick }: { s: Spot; on: boolean; onPick: () => void }) {
  const l = lang.value, w = words();
  const by = taken.value.get(s.id)?.name;
  return (
    <button type="button" class={`tk-mini${by ? " is-taken" : ""}${on ? " is-on" : ""}`} data-sfx="none" onClick={onPick}
      aria-label={`${kindOf(s, l)} : ${s.name[l]}${by ? `, ${w.takenBy}` : ""}`}>
      <span class="tk-mini__kind">{kindOf(s, l)}</span>
      <span class="tk-mini__name">{s.name[l]}</span>
      <span class="tk-mini__meta num">{metaOf(s, l) || " "}</span>
      <span class="tk-mini__state">{by ? `${w.takenBy} · ${by}` : w.free}</span>
    </button>
  );
}

/** A logo chosen by the buyer, made small and square-safe here (at most 320 px, PNG on white): a few tens of kB. */
async function shrinkLogo(file: File): Promise<Blob | null> {
  if (!/^image\//.test(file.type) || file.size > 15 * 1024 * 1024) return null;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  } catch (_) { return null; }
}

function Ticket({ spot }: { spot: Spot }) {
  const l = lang.value, w = words();
  const owner = taken.value.get(spot.id);
  const by = owner?.name;
  const logo = logoSrc(owner);
  const el = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [who, setWho] = useState("");
  const [contact, setContact] = useState("");
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const [euros, setEuros] = useState(spot.kind === "km" ? "10" : "50");
  const [askFree, setAskFree] = useState(false);
  const [mine, setMine] = useState<{ blob: Blob; url: string } | null>(null);
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error"; msg?: string }>({ kind: "idle" });
  const whoField = useRef<HTMLInputElement>(null);
  const contactField = useRef<HTMLInputElement>(null);
  const priceField = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { untilt(); whoField.current?.focus(); } }, [open]);
  useEffect(() => () => { if (mine) URL.revokeObjectURL(mine.url); }, [mine]);
  const price = Math.round(parseFloat(euros.replace(",", ".")) || 0);

  // the foil follows a mouse; a finger scrolls the page, so there the light sweeps once on its own
  const tilt = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !el.current || open) return; // (a form doesn't move under the pointer)
    const r = el.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.current.style.setProperty("--rx", `${(0.5 - py) * 7}deg`);
    el.current.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
    el.current.style.setProperty("--gx", `${px * 100}%`);
  };
  const untilt = () => { el.current?.style.setProperty("--rx", "0deg"); el.current?.style.setProperty("--ry", "0deg"); el.current?.style.removeProperty("--gx"); };
  const shine = () => {
    const f = el.current?.querySelector<HTMLElement>(".tk__foil");
    if (!f?.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    f.animate([{ backgroundPosition: "120% 0" }, { backgroundPosition: "-40% 0" }], { duration: 900, easing: "cubic-bezier(.3,.7,.2,1)" });
  };

  const shake = (f: HTMLElement | null) => {
    if (!f?.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    f.animate([{ transform: "none" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "none" }], { duration: 320, easing: "ease-in-out" });
  };
  const pickLogo = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (!f) return;
    const blob = await shrinkLogo(f);
    if (!blob) { setState({ kind: "error", msg: w.badLogo }); return; }
    setMine({ blob, url: URL.createObjectURL(blob) });
    setState({ kind: "idle" });
  };
  const submit = async (e: Event) => {
    e.preventDefault();
    if (trap || state.kind === "sending") return;
    if (!who.trim()) { setState({ kind: "error", msg: w.needWho }); whoField.current?.focus(); shake(whoField.current); return; }
    if (!contact.trim()) { setState({ kind: "error", msg: w.needContact }); contactField.current?.focus(); shake(contactField.current); return; }
    if (!askFree && !(price >= MIN_EUR && price <= MAX_EUR)) { setState({ kind: "error", msg: w.needPrice }); priceField.current?.focus(); shake(priceField.current); return; }
    setState({ kind: "sending" });
    if (askFree) {
      // a ticket for free: a request I answer in the Carnet (so nobody can fill the map for nothing)
      const r = await requestSpot(spot, { who: who.trim(), contact: contact.trim(), link: link.trim(), offer: "0", message: msg.trim() }, l);
      if (r !== "ok") { setState({ kind: "error", msg: w.err[r] }); return; }
      setState({ kind: "idle" });
      setOpen(false);
      setSent(true);
      play("signed");
      // the stamp lands: the ticket gives under it
      if (el.current?.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        el.current.animate([{ transform: "none" }, { transform: "translateY(3px) scale(0.985)", offset: 0.35 }, { transform: "none" }], { duration: 420, delay: 180, easing: "ease-out" });
      }
      return;
    }
    // bought: held a moment, then straight to Stripe; back on the site the ticket is given (see PaidBanner)
    const r = await buySpot(spot, { who: who.trim(), contact: contact.trim(), link: link.trim(), message: msg.trim(), euros: price, logo: mine?.blob ?? null }, l);
    if (!r.ok) { setState({ kind: "error", msg: w.err[r.why] }); if (r.why === "taken") loadTaken(true); return; }
    play("whoosh");
    location.href = r.url;
  };

  const stamp = sent ? w.asked : by ? `${w.takenBy}` : w.free;
  return (
    <article ref={el} class={`tk${by ? " is-taken" : ""}${sent ? " is-asked" : ""}`} onPointerMove={tilt} onPointerLeave={untilt}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, textarea, label, form")) shine(); }}
      aria-label={`${kindOf(spot, l)} : ${spot.name[l]}`}>
      <div class="tk__card">
        <div class="tk__body">
          <span class="tk__foil" aria-hidden="true" />
          <p class="tk__top"><span>{kindOf(spot, l)}</span><span class="num">N° {serial(spot)}</span></p>
          <h3 class="tk__name">{spot.name[l]}</h3>
          {metaOf(spot, l) && <p class="tk__meta num">{metaOf(spot, l)}</p>}
          <p class="tk__gets">{w.gets[spot.kind]}</p>
          {owner && (logo || owner.link) && (
            <p class="tk__owner">
              {logo && <img class="tk__logo" src={logo} alt="" width={40} height={40} loading="lazy" />}
              <span><b>{owner.name}</b>{owner.link && <a href={owner.link} target="_blank" rel="noopener">{w.visit} {linkLabel(owner.link)}</a>}</span>
            </p>
          )}
          <span class={`tk__stamp${sent ? " is-asked" : by ? " is-taken" : ""}`} aria-hidden={!sent && !by}>
            {stamp}{by && !sent ? <small>{by}</small> : null}
          </span>
        </div>
        <div class="tk__stub">
          {!open && !sent && (
            <button class="btn btn--primary btn--block" type="button" data-sfx="tap" disabled={!!by} onClick={() => { setOpen(true); setState({ kind: "idle" }); }}>
              {by ? w.gone : w.want}
            </button>
          )}
          {sent && <p class="tk__thanks" role="status">{w.thanksFree}</p>}
          {open && (
            <form class="form tk__form" onSubmit={submit} noValidate>
              <label class="note__label" for="tk-who">{w.who}</label>
              <input ref={whoField} id="tk-who" class="field" type="text" maxLength={60} autoComplete="organization" value={who} onInput={(e) => setWho((e.target as HTMLInputElement).value)} />
              <label class="note__label" for="tk-contact">{w.contact} <span class="tk__hint">({w.contactHint})</span></label>
              <input ref={contactField} id="tk-contact" class="field" type="text" maxLength={120} autoComplete="email" inputMode="email" value={contact} onInput={(e) => setContact((e.target as HTMLInputElement).value)} />
              <label class="note__label" for="tk-link">{w.link} <span class="tk__hint">({w.linkHint})</span></label>
              <input id="tk-link" class="field" type="text" maxLength={200} inputMode="url" autoComplete="url" autoCapitalize="none" placeholder="@…  /  monsite.com" value={link} onInput={(e) => setLink((e.target as HTMLInputElement).value)} />
              {!askFree && (
                <>
                  <span class="note__label">{w.logo} <span class="tk__hint">({w.logoHint})</span></span>
                  <label class="tk__logopick">
                    {mine ? <img src={mine.url} alt="" width={44} height={44} /> : <span class="tk__logoempty" aria-hidden="true" />}
                    <span>{mine ? w.logoChange : w.logoPick}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" class="sr-only" onChange={pickLogo} />
                  </label>
                  <label class="note__label" for="tk-price">{w.price} <span class="tk__hint">({w.priceHint})</span></label>
                  <div class="tk__price">
                    <input ref={priceField} id="tk-price" class="field num" type="number" inputMode="numeric" min={MIN_EUR} max={MAX_EUR} step={1} value={euros} onInput={(e) => setEuros((e.target as HTMLInputElement).value)} />
                    <span aria-hidden="true">€</span>
                  </div>
                </>
              )}
              <label class="note__label" for="tk-msg">{w.msg} <span class="tk__hint">({w.msgHint})</span></label>
              <textarea id="tk-msg" class="field" rows={2} maxLength={400} value={msg} onInput={(e) => setMsg((e.target as HTMLTextAreaElement).value)} />
              <label class="tk__free">
                <input type="checkbox" checked={askFree} onChange={(e) => { setAskFree((e.target as HTMLInputElement).checked); setState({ kind: "idle" }); }} />
                <span>{w.askFree}<small>{w.askFreeHint}</small></span>
              </label>
              <input type="text" name="website" tabIndex={-1} autoComplete="off" class="sr-only" aria-hidden="true" value={trap} onInput={(e) => setTrap((e.target as HTMLInputElement).value)} />
              <div class="form__row">
                <button class="btn" type="button" data-sfx="close" onClick={() => { setOpen(false); setState({ kind: "idle" }); }}>{w.cancel}</button>
                <button class="btn btn--primary" type="submit" data-sfx="none" disabled={state.kind === "sending"}>
                  {state.kind === "sending" ? w.sending : askFree ? w.send : w.pay(fmtInt(price >= MIN_EUR ? price : MIN_EUR, l))}
                </button>
              </div>
              {!askFree && <p class="fine tk__secure">{w.secure}</p>}
              <p class={state.kind === "error" ? "form__msg is-error" : "sr-only"} role="status" aria-live="polite">{state.kind === "error" ? state.msg : ""}</p>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}
