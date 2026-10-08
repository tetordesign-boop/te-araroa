import { lang, setLang, t } from "../i18n";
import { dayOnTrail, days, media, progressKm, route, settings, walkedKm, clock } from "../lib/data";
import { addDays, fmtDate, fmtInt, fmtKm, nzToday } from "../lib/format";
import { DayRow } from "./Home";
import { ChevronLeft } from "./icons";
import { go, goBack } from "./state";

function Header({ title }: { title: string }) {
  return (
    <>
      <div class="dayhead" style={{ marginBottom: "6px" }}>
        <button class="iconbtn" type="button" aria-label={t("back")}
          onClick={goBack}><ChevronLeft /></button>
      </div>
      <h1 class="page-title">{title}</h1>
    </>
  );
}

export function Journal() {
  const list = [...days.value].reverse();
  return (
    <div>
      <Header title={t("journal")} />
      {list.length ? (
        <div class="list" style={{ marginTop: "16px" }}>{list.map((d) => <DayRow d={d} large />)}</div>
      ) : (
        <p class="empty" style={{ marginTop: "12px" }}>{t("journalEmpty")}</p>
      )}
    </div>
  );
}

export function Stats() {
  const l = lang.value;
  const ds = days.value;
  const hikeDays = ds.filter((d) => d.kind === "hike" && (d.distance_km ?? 0) > 0);
  const rest = ds.filter((d) => d.kind === "rest").length;
  const walked = walkedKm.value;
  const prog = progressKm.value;
  const onTrail = dayOnTrail.value ?? ds.length;
  const ascent = ds.reduce((s, d) => s + (d.ascent_m ?? 0), 0);
  const nMedia = media.value.length;
  const longest = hikeDays.reduce<typeof hikeDays[number] | null>((b, d) => (!b || (d.distance_km ?? 0) > (b.distance_km ?? 0) ? d : b), null);
  const avg = hikeDays.length ? hikeDays.reduce((s, d) => s + (d.distance_km ?? 0), 0) / hikeDays.length : 0;
  const remaining = Math.max(0, route.value.total - prog);
  const pace = onTrail > 0 ? prog / onTrail : 0;
  const today = nzToday(new Date(clock.value));
  const eta = ds.length >= 5 && pace > 1 && remaining > 0.5 ? addDays(today, Math.ceil(remaining / pace)) : null;

  return (
    <div>
      <Header title={t("stats")} />
      {!ds.length ? <p class="empty" style={{ marginTop: "12px" }}>{t("statsSoon")}</p> : (
        <div class="kv">
          <div class="kv__item kv__item--wide">
            <div class="kv__v num">{fmtKm(prog, l, 0)}<small>/ {fmtKm(route.value.total, l, 0)} km</small></div>
            <div class="kv__k">{t("statsWalked")}{walked > 0 && Math.abs(walked - prog) > 2 ? ` (${fmtKm(walked, l, 0)} km ${l === "fr" ? "à pied" : "on foot"})` : ""}</div>
          </div>
          <div class="kv__item"><div class="kv__v num">{fmtInt(onTrail, l)}</div><div class="kv__k">{t("statsDays")}</div></div>
          <div class="kv__item"><div class="kv__v num">{fmtInt(rest, l)}</div><div class="kv__k">{t("statsRest")}</div></div>
          <div class="kv__item"><div class="kv__v num">{fmtKm(avg, l, 1)}<small>km</small></div><div class="kv__k">{t("statsAvg")}</div></div>
          <div class="kv__item"><div class="kv__v num">{fmtInt(ascent, l)}<small>m</small></div><div class="kv__k">{t("statsAscent")}</div></div>
          {longest && (
            <button class="kv__item" type="button" style={{ textAlign: "left" }} onClick={() => go({ name: "day", n: longest.day_number })}>
              <div class="kv__v num">{fmtKm(longest.distance_km, l, 1)}<small>km</small></div>
              <div class="kv__k">{t("statsLongest")}, {t("day", { n: longest.day_number }).toLowerCase()}</div>
            </button>
          )}
          <div class="kv__item"><div class="kv__v num">{fmtInt(nMedia, l)}</div><div class="kv__k">{t("statsPhotos")}</div></div>
          {eta && (
            <div class="kv__item kv__item--wide">
              <div class="kv__v">{fmtDate(eta, l, { weekday: "long", day: "numeric", month: "long" })}</div>
              <div class="kv__k">{t("statsEta")}, {t("statsEtaNote")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function About() {
  const l = lang.value;
  const s = settings.value;
  const intro = (l === "en" && s?.intro_en) || s?.intro_fr;
  return (
    <div>
      <Header title={t("about")} />
      {intro && <div class="prose voice" style={{ marginTop: "14px" }}>{intro.split(/\n{2,}/).map((p) => <p>{p}</p>)}</div>}
      <div class="section">
        <p class="prose">{t("addHome")}</p>
      </div>
      <div class="section">
        <button class="btn" type="button" onClick={() => setLang(l === "fr" ? "en" : "fr")}>{t("lang")}</button>
      </div>
      <div class="section">
        <h2 class="section__title" style={{ fontSize: "17px" }}>{t("credits")}</h2>
        <p class="fine" style={{ marginTop: "6px" }}>{t("creditsText")}</p>
      </div>
    </div>
  );
}
