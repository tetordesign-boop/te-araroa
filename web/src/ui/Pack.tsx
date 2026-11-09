// "Mon sac": what Ewan carries for the whole South Island, as he writes it in the Carnet (settings.gear).
// The headline is the base weight (what thru-hikers compare: in the pack, without food or water); a ladder of orange
// bars shows where the grams go, each bar a way into its section; then the list itself, section by section, in grams,
// his own remarks in his voice.

import { useState } from "preact/hooks";
import { mediaUrl } from "../config";
import { lang, t, type Key } from "../i18n";
import { fmtInt, typo } from "../lib/format";
import { fmtWeight, GEAR_CATS, gearTotals, itemG, sectionG, type GearCat, type GearItem } from "../lib/gear";
import { settings } from "../lib/data";
import { Backpack, ChevronRight } from "./icons";
import { PageHead } from "./Pages";
import { go, hrefFor } from "./state";

const catName = (c: GearCat) => t(`gear_${c}` as Key);
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** "8,4" for the big line (kg, one decimal) */
const kgNum = (g: number, l: "fr" | "en") => new Intl.NumberFormat(l === "fr" ? "fr-FR" : "en-NZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(g / 1000);
/** a figure with its unit apart, as in the stats */
const Fig = ({ g, l }: { g: number; l: "fr" | "en" }) => {
  const [v, u] = fmtWeight(g, l).split(" ");
  return <>{v}<small>{u}</small></>;
};

/** The way in, from the home panel and the "About" page: only once there is a list. */
export function PackRow({ block }: { block?: boolean }) {
  const l = lang.value;
  const items = settings.value?.gear?.items ?? [];
  if (!items.length) return null;
  const tot = gearTotals(items);
  return (
    <div class={block ? "rows block" : "rows"}>
      <a class="row" href={hrefFor({ name: "pack" })} onClick={(e) => { e.preventDefault(); go({ name: "pack" }); }}>
        <span class="row__thumb row__thumb--empty" aria-hidden="true"><Backpack /></span>
        <span class="row__main">
          <span class="row__title">{t("pack")}</span>
          <span class="row__meta num">{t("packLine", { kg: fmtWeight(tot.base, l), n: fmtInt(tot.n, l) })}</span>
        </span>
        <ChevronRight class="row__chev" />
      </a>
    </div>
  );
}

export function Pack() {
  const l = lang.value;
  const gear = settings.value?.gear ?? null;
  const items = gear?.items ?? [];
  const [lit, setLit] = useState<GearCat | null>(null);
  if (!items.length) {
    return (
      <div class="page">
        <PageHead title={t("pack")} />
        <p class="empty" style={{ marginTop: "14px" }}>{t("packEmpty")}</p>
      </div>
    );
  }
  const tot = gearTotals(items);
  const max = tot.byCat[0]?.g || 1;
  const note = (l === "en" && gear?.note_en) || gear?.note_fr;
  const nameOf = (i: GearItem) => (l === "en" && i.name_en) || i.name;
  const cats = GEAR_CATS.filter((c) => items.some((i) => i.cat === c));
  const toSection = (c: GearCat) => {
    document.getElementById(`gear-${c}`)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    setLit(c);
    window.setTimeout(() => setLit((x) => (x === c ? null : x)), 1600);
  };

  return (
    <div class="page pack">
      <PageHead title={t("pack")} />
      <div class="bigline">
        <span class="num bigline__v">{kgNum(tot.base, l)}</span>
        <span class="bigline__u">{t("packBase")}</span>
      </div>

      {gear?.photo ? (
        <figure class="pack__photo">
          <img src={mediaUrl(gear.photo)} width={gear.photo_w ?? undefined} height={gear.photo_h ?? undefined} alt={t("packPhotoAlt")} loading="lazy" decoding="async" />
          {note && <figcaption class="voice">{typo(note)}</figcaption>}
        </figure>
      ) : note ? <div class="prose voice" style={{ marginTop: "18px" }}><p>{typo(note)}</p></div> : null}

      <dl class="figs">
        {tot.worn > 0 && <div><dt>{t("packWorn")}</dt><dd class="num"><Fig g={tot.worn} l={l} /></dd></div>}
        {tot.food > 0 && <div><dt>{t("packFood")}</dt><dd class="num"><Fig g={tot.food} l={l} /></dd></div>}
        {tot.food > 0 && <div><dt>{t("packLeaving")}</dt><dd class="num"><Fig g={tot.base + tot.food} l={l} /></dd></div>}
        <div><dt>{t("packItems")}</dt><dd class="num">{fmtInt(tot.n, l)}</dd></div>
      </dl>

      {tot.byCat.length > 1 && (
        <section class="block">
          <h2 class="h-section" style={{ marginBottom: "14px" }}>{t("packWhere")}</h2>
          <ul class="wbars">
            {tot.byCat.map((c, i) => (
              <li>
                <a class="wbars__row" href={`#gear-${c.cat}`} onClick={(e) => { e.preventDefault(); toSection(c.cat); }}>
                  <span class="wbars__name">{catName(c.cat)}</span>
                  <span class="wbars__v num">{fmtWeight(c.g, l)}</span>
                  <span class="wbars__track" aria-hidden="true">
                    <span class="wbars__bar" style={{ width: `${Math.max(2, (c.g / max) * 100)}%`, "--d": `${i * 70}ms` }} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cats.map((c) => {
        const list = items.filter((i) => i.cat === c);
        const sum = sectionG(list);
        return (
          <section class={`block gearcat${lit === c ? " is-lit" : ""}`} id={`gear-${c}`} key={c}>
            <div class="block__head">
              <h2 class="h-section">{catName(c)}</h2>
              {sum > 0 && <span class="gearcat__sum num">{fmtWeight(sum, l)}</span>}
            </div>
            <ul class="gearlist">
              {list.map((i) => (
                <li class="gear">
                  <span class="gear__main">
                    <span class="gear__name">{nameOf(i)}{(i.qty ?? 1) > 1 && <span class="gear__qty num">{` × ${i.qty}`}</span>}</span>
                    {(i.detail || i.worn) && (
                      <span class="gear__detail">
                        {i.detail}
                        {i.worn && <span class="gear__tag">{t("packWornTag")}</span>}
                      </span>
                    )}
                    {i.note && <span class="gear__note voice">{typo(i.note)}</span>}
                  </span>
                  <span class="gear__g num">{i.g ? `${fmtInt(itemG(i), l)} g` : "–"}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
