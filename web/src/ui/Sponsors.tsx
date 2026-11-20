// "Les tickets du sentier": sponsor a piece of my Te Araroa. On the trail you pay the huts with tickets, so here each
// spot is one. The whole trail is drawn as its skyline (the elevation profile): a finger slides along it, an orange
// cursor follows with the km, the place and the height, and snaps to a pass when near one; let go and a ticket comes
// out of the slot below, foil catching the light. "Je veux ce ticket" opens a small form inside it, and once sent an
// orange stamp lands on it. Below the skyline, the tickets that aren't a point on it: start and finish, the passes
// and sections in a row each, the food parcels, the hardships and the places on my gear.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n";
import { fmtInt } from "../lib/format";
import { profile } from "../lib/places";
import { play } from "../lib/sound";
import {
  cols, ends, galeres, gearSpots, heightAt, kmSpot, linkLabel, loadTaken, logoSrc, nearKm, parcelSpots, requestSpot, sections, taken, totalKm,
  type AskResult, type Spot, type SpotKind,
} from "../lib/sponsors";
import type { Lang } from "../types";
import { ChevronRight } from "./icons";
import { PageHead } from "./Pages";
import { route } from "../lib/data";
import { go, hrefFor, isDesktop, mapApi } from "./state";

// ------------------------------------------------------------------ words (first person; place names stay as they are)
const W = {
  fr: {
    lead: "Je marche 1 334 km, de Ship Cove à Bluff. Chaque kilomètre, chaque col, chaque colis peut porter ton nom ou celui de ta marque, et tu proposes le prix que tu veux. Sur le sentier, on paie les refuges avec des tickets : ici, chaque emplacement en est un.",
    hint: "Fais glisser ton doigt sur le sentier",
    hintKeys: "Flèches pour avancer, Entrée pour prendre le ticket",
    kind: { km: "Kilomètre", col: "Col", section: "Section", end: "Départ et arrivée", colis: "Colis", galere: "Galère", gear: "Matériel" } as Record<SpotKind, string>,
    decks: { end: "Le départ et l'arrivée", col: "Les cols", section: "Les sections", colis: "Les colis", galere: "Les galères", gear: "Mon matériel" } as Record<string, string>,
    deckNote: {
      colis: "Les portions de plus de 100 km sans magasin.",
      galere: "Une marque présente la galère, à chaque fois qu'elle arrive.",
      gear: "Un patch ou un sticker, dans chaque photo.",
    } as Record<string, string>,
    gets: {
      km: "Ton nom ou ton logo sur la carte à ce kilomètre. Et quand j'y passe, je t'envoie une photo de l'endroit.",
      col: "Ton logo en 3D sur la carte interactive, au col, avec le lien vers ton site ou ton Insta. Et dans l'épisode où je le passe : « ce col vous est présenté par… ».",
      section: "Ton logo en 3D sur la carte au milieu de la section, avec ton lien, et sur l'écran titre de son épisode.",
      end: "Ton logo en 3D sur la carte à cet endroit, avec ton lien, dans le teaser et dans le film de la fin.",
      colis: "Tu remplis le colis de nourriture qui m'attend sur cette portion sans magasin, je l'ouvre en vidéo, et ton logo tourne sur la carte à cet endroit.",
      galere: "Ta marque présente cette galère chaque fois qu'elle arrive dans mes vidéos. Il y en aura.",
      gear: "Ton patch ou ton sticker sur mon matériel, dans chaque photo et chaque vidéo.",
    } as Record<SpotKind, string>,
    near: "près de", highest: "le point le plus haut du sentier", noShop: "sans magasin", from: (a: string, b: string) => `du km ${a} au km ${b}`,
    free: "Libre", takenBy: "Réservé", asked: "Demandé",
    want: "Je veux ce ticket", gone: "Déjà réservé",
    who: "Ton nom ou ta marque", contact: "Pour te répondre", contactHint: "e-mail ou Instagram", msg: "Un mot", msgHint: "facultatif",
    link: "Ton site ou ton Insta", linkHint: "pour le lien sous ton logo", offer: "Ton prix", offerHint: "celui que tu veux", offerEx: "30 €, 200 NZD, du matériel…",
    visit: "Voir",
    send: "Envoyer la demande", sending: "Envoi…", cancel: "Annuler",
    needWho: "Écris ton nom ou celui de ta marque.", needContact: "Laisse-moi un moyen de te répondre.",
    err: { rate: "Trop de demandes d'un coup : réessaie dans quelques minutes.", links: "Un seul lien par message, s'il te plaît.", closed: "Les demandes ne sont pas encore ouvertes : réessaie bientôt.", error: "La demande n'est pas partie : vérifie ta connexion et réessaie." } as Record<Exclude<AskResult, "ok">, string>,
    thanks: "C'est noté. Je te réponds dès que j'ai du réseau. Tu ne paies qu'après mon accord, par un lien sécurisé.",
    paidTitle: "Paiement reçu, merci !", paidText: "Ton ticket est à toi. Ton logo arrive sur la carte dès que je l'ai ajouté, et tu passes dans la vidéo quand j'arrive à ton emplacement.",
    another: "Choisir un autre ticket",
    how: "Comment ça marche",
    steps: ["Tu choisis ton ticket et tu proposes ton prix.", "Je te réponds dès que j'ai du réseau. Si on est d'accord, je t'envoie un lien de paiement sécurisé (Stripe).", "Ton logo tourne en 3D sur la carte à ton emplacement, avec ton lien, puis tu passes dans les vidéos quand j'y arrive."],
    counts: (free: number) => `${free} tickets libres, sans compter les kilomètres`,
  },
  en: {
    lead: "I'm walking 1,334 km, from Ship Cove to Bluff. Every kilometre, every pass, every food parcel can carry your name or your brand's, at the price you choose. On the trail you pay for huts with tickets: here, every spot is one.",
    hint: "Slide your finger along the trail",
    hintKeys: "Arrow keys to move, Enter to take the ticket",
    kind: { km: "Kilometre", col: "Pass", section: "Section", end: "Start and finish", colis: "Food parcel", galere: "Hardship", gear: "Gear" } as Record<SpotKind, string>,
    decks: { end: "The start and the finish", col: "The passes", section: "The sections", colis: "The food parcels", galere: "The hardships", gear: "My gear" } as Record<string, string>,
    deckNote: {
      colis: "The stretches of 100 km or more with no shop.",
      galere: "A brand presents the hardship, every time it shows up.",
      gear: "A patch or a sticker, in every photo.",
    } as Record<string, string>,
    gets: {
      km: "Your name or logo on the map at this kilometre. And when I walk through it, I send you a photo of the spot.",
      col: "Your logo in 3D on the interactive map, at the pass, with a link to your site or Instagram. And in the episode where I cross it: “this pass is brought to you by…”.",
      section: "Your logo in 3D on the map in the middle of the section, with your link, and on its episode's title card.",
      end: "Your logo in 3D on the map at this spot, with your link, in the teaser and in the final film.",
      colis: "You fill the food parcel waiting for me on this stretch with no shop, I open it on camera, and your logo spins on the map right there.",
      galere: "Your brand presents this hardship every time it shows up in my videos. It will.",
      gear: "Your patch or sticker on my gear, in every photo and every video.",
    } as Record<SpotKind, string>,
    near: "near", highest: "the highest point of the trail", noShop: "with no shop", from: (a: string, b: string) => `from km ${a} to km ${b}`,
    free: "Free", takenBy: "Taken", asked: "Requested",
    want: "I want this ticket", gone: "Already taken",
    who: "Your name or your brand", contact: "How to reach you", contactHint: "email or Instagram", msg: "A word", msgHint: "optional",
    link: "Your website or Instagram", linkHint: "for the link under your logo", offer: "Your price", offerHint: "whatever you like", offerEx: "NZ$50, €30, some gear…",
    visit: "Visit",
    send: "Send the request", sending: "Sending…", cancel: "Cancel",
    needWho: "Write your name or your brand's.", needContact: "Leave me a way to reach you.",
    err: { rate: "Too many requests at once: try again in a few minutes.", links: "One link per message, please.", closed: "Requests aren't open yet: try again soon.", error: "The request didn't go through: check your connection and try again." } as Record<Exclude<AskResult, "ok">, string>,
    thanks: "Got it. I'll get back to you as soon as I have signal. You only pay once I've said yes, through a secure link.",
    paidTitle: "Payment received, thank you!", paidText: "The ticket is yours. Your logo goes on the map as soon as I've added it, and you're in the video when I reach your spot.",
    another: "Pick another ticket",
    how: "How it works",
    steps: ["You pick your ticket and name your price.", "I get back to you as soon as I have signal. If we agree, I send you a secure payment link (Stripe).", "Your logo spins in 3D on the map at your spot, with your link, then you're in the videos when I get there."],
    counts: (free: number) => `${free} free tickets, not counting the kilometres`,
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
  useEffect(() => { loadTaken(true); }, []);

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

  const decks: [string, Spot[]][] = [
    ["end", ends.value], ["col", cols.value], ["section", sections.value], ["colis", parcelSpots.value], ["galere", galeres], ["gear", gearSpots],
  ];
  const freeCount = decks.reduce((n, [, list]) => n + list.filter((s) => !taken.value.has(s.id)).length, 0);

  return (
    <div class="page spage">
      <PageHead title={t("sponsors")} />
      {paid && (
        <div class="tk-paid" role="status">
          <span class="tk-paid__stamp" aria-hidden="true">{l === "fr" ? "Payé" : "Paid"}</span>
          <p><b>{w.paidTitle}</b> {w.paidText}</p>
        </div>
      )}
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
            {w.deckNote[key] && <p class="fine">{w.deckNote[key]}</p>}
          </div>
          <div class="tk-deck__row">
            {list.map((s) => <MiniTicket s={s} on={sel?.id === s.id} onPick={() => pick(s, true)} />)}
          </div>
        </section>
      ))}

      <section class="block" aria-labelledby="tk-how">
        <h2 class="h-section" id="tk-how">{w.how}</h2>
        <ol class="tk-steps">{w.steps.map((s) => <li>{s}</li>)}</ol>
      </section>
      <p class="fine block" style={{ marginTop: "20px" }}>{l === "fr" ? "Le tracé, les cols et les altitudes viennent des données du site (OpenStreetMap)." : "The route, passes and heights come from the site's data (OpenStreetMap)."}</p>
    </div>
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
    case "colis": return `${fmtK(len, l)} km ${w.noShop}`;
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
  const [offer, setOffer] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error"; msg?: string }>({ kind: "idle" });
  const whoField = useRef<HTMLInputElement>(null);
  const contactField = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { untilt(); whoField.current?.focus(); } }, [open]);

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
  const submit = async (e: Event) => {
    e.preventDefault();
    if (trap || state.kind === "sending") return;
    if (!who.trim()) { setState({ kind: "error", msg: w.needWho }); whoField.current?.focus(); shake(whoField.current); return; }
    if (!contact.trim()) { setState({ kind: "error", msg: w.needContact }); contactField.current?.focus(); shake(contactField.current); return; }
    setState({ kind: "sending" });
    const r = await requestSpot(spot, { who: who.trim(), contact: contact.trim(), link: link.trim(), offer: offer.trim(), message: msg.trim() }, l);
    if (r !== "ok") { setState({ kind: "error", msg: w.err[r] }); return; }
    setState({ kind: "idle" });
    setOpen(false);
    setSent(true);
    play("signed");
    // the stamp lands: the ticket gives under it
    if (el.current?.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.current.animate([{ transform: "none" }, { transform: "translateY(3px) scale(0.985)", offset: 0.35 }, { transform: "none" }], { duration: 420, delay: 180, easing: "ease-out" });
    }
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
          {sent && <p class="tk__thanks" role="status">{w.thanks}</p>}
          {open && (
            <form class="form tk__form" onSubmit={submit} noValidate>
              <label class="note__label" for="tk-who">{w.who}</label>
              <input ref={whoField} id="tk-who" class="field" type="text" maxLength={60} autoComplete="organization" value={who} onInput={(e) => setWho((e.target as HTMLInputElement).value)} />
              <label class="note__label" for="tk-contact">{w.contact} <span class="tk__hint">({w.contactHint})</span></label>
              <input ref={contactField} id="tk-contact" class="field" type="text" maxLength={120} autoComplete="email" inputMode="email" value={contact} onInput={(e) => setContact((e.target as HTMLInputElement).value)} />
              <label class="note__label" for="tk-offer">{w.offer} <span class="tk__hint">({w.offerHint})</span></label>
              <input id="tk-offer" class="field" type="text" maxLength={60} placeholder={w.offerEx} value={offer} onInput={(e) => setOffer((e.target as HTMLInputElement).value)} />
              <label class="note__label" for="tk-link">{w.link} <span class="tk__hint">({w.linkHint})</span></label>
              <input id="tk-link" class="field" type="text" maxLength={200} inputMode="url" autoComplete="url" autoCapitalize="none" placeholder="@…  /  monsite.com" value={link} onInput={(e) => setLink((e.target as HTMLInputElement).value)} />
              <label class="note__label" for="tk-msg">{w.msg} <span class="tk__hint">({w.msgHint})</span></label>
              <textarea id="tk-msg" class="field" rows={2} maxLength={400} value={msg} onInput={(e) => setMsg((e.target as HTMLTextAreaElement).value)} />
              <input type="text" name="website" tabIndex={-1} autoComplete="off" class="sr-only" aria-hidden="true" value={trap} onInput={(e) => setTrap((e.target as HTMLInputElement).value)} />
              <div class="form__row">
                <button class="btn" type="button" data-sfx="close" onClick={() => { setOpen(false); setState({ kind: "idle" }); }}>{w.cancel}</button>
                <button class="btn btn--primary" type="submit" data-sfx="none" disabled={state.kind === "sending"}>{state.kind === "sending" ? w.sending : w.send}</button>
              </div>
              <p class={state.kind === "error" ? "form__msg is-error" : "sr-only"} role="status" aria-live="polite">{state.kind === "error" ? state.msg : ""}</p>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}
