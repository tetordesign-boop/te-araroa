// "Mon étape" (src/admin/plan.ts does the sums): where I am on the trail, the next 40 km drawn and listed, the day
// to plan (where to sleep, how long, until when the light lasts), my pace, and the next parcel. Private: it lives in
// the Carnet only, and works with no signal. Navigation itself stays with the official trail app.
import { useEffect, useState } from "preact/hooks";
import { fmtKm, nzToday } from "../lib/format";
import { KIND_COLOR } from "../map/pois";
import { weatherLabel } from "../i18n";
import type { LngLat } from "../lib/geo";
import { cachedForecast, dayOf, getForecast, type Forecast } from "../lib/weather";
import { ChevronRight, Locate } from "../ui/icons";
import { Bar } from "./Pages";
import { open, say } from "./nav";
import { parcels } from "./Parcels";
import { adminRoute } from "./server";
import {
  addDays, between, candidates, climb, defaultPlanDate, elevAt, factor, fix, fmtHours, here, learned, loadPlanData, locate, locating,
  nzClock, PACE_LABEL, plan, planPois, planProfile, prefs, savePlan, setPrefs, setSim, sim, sunTimes, walkHours,
  type PacePreset, type Stop, type StopKind,
} from "./plan";

const SPAN = 40;
const KIND_FR: Record<StopKind, string> = { town: "Étape du sentier", hut: "Refuge", camp: "Camping", water: "Point d'eau", shop: "Ravitaillement", pass: "Col", gap: "Transfert" };
const SHOP_FR: Record<string, string> = { super: "Supermarché", general: "Épicerie", conv: "Supérette", gear: "Magasin outdoor", post: "Poste", info: "Centre d'info" };
const km1 = (k: number) => fmtKm(k, "fr", 1);
const m0 = (m: number) => `${Math.round(m).toLocaleString("fr-FR")} m`;
const color = (k: StopKind) => (k === "town" ? "#F3F6FB" : KIND_COLOR[k].dark);
const ago = (at: number) => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const dayLabel = (date: string) => (date === nzToday() ? "Aujourd'hui" : date === addDays(nzToday(), 1) ? "Demain" : new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }));

function details(s: Stop): string {
  const p = s.poi, out: string[] = [];
  if (s.kind === "gap") return s.note ?? "";
  if (s.kind === "shop" && p?.sub) out.push(SHOP_FR[p.sub] ?? "");
  if (s.kind === "hut" && p?.cap) out.push(`${p.cap} places`);
  if (p?.book) out.push("à réserver");
  if (p?.fee === 1) out.push("payant");
  if (s.kind === "water" && p?.spr) out.push("source, à traiter");
  if (p?.water && s.kind !== "water") out.push("eau");
  if (s.d > 300) out.push(`à ${fmtKm(s.d / 1000, "fr", 1)} km du sentier`);
  return out.filter(Boolean).join(" · ");
}

/** A forecast at a point: the last one kept on the phone right away, then a fresh one when there is signal. */
function useWx(c: LngLat | null, elev: number | null): Forecast | null {
  const key = c ? `${c[0].toFixed(2)},${c[1].toFixed(2)},${elev ?? ""}` : "";
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    if (!c) { setF(null); return; }
    let alive = true;
    setF(cachedForecast(c[1], c[0], elev));
    getForecast(c[1], c[0], elev).then((x) => alive && x && setF(x));
    return () => { alive = false; };
  }, [key]);
  return f;
}

function WxLine({ f, date, label }: { f: Forecast | null; date: string; label: string }) {
  const d = dayOf(f, date);
  if (!f || !d) return null;
  const w = weatherLabel(d.code, "fr");
  const age = Date.now() - f.at;
  return (
    <p class="plan-day__line plan-wx">
      <span aria-hidden="true">{w.icon}</span> {label} : {w.label}, <b class="num">{Math.round(d.min)}° à {Math.round(d.max)}°</b>
      {d.rain >= 0.5 ? `, ${fmtKm(d.rain, "fr", 1)} mm de pluie` : ", sec"}{d.gust >= 40 ? `, rafales ${Math.round(d.gust)} km/h` : ""}.
      {age > 3 * 3600e3 ? <span class="plan-wx__age"> Prévision {ago(f.at)}.</span> : null}
    </p>
  );
}

// ------------------------------------------------------------------ the next 40 km, drawn
function Strip({ from, to, list, target }: { from: number; to: number; list: Stop[]; target: Stop | null }) {
  const W = 340, H = 128, T = 18, B = 22;
  const pts: [number, number][] = [];
  for (let k = from; k <= to + 1e-6; k += 0.25) pts.push([k, elevAt(k) ?? 0]);
  if (pts.length < 2) return null;
  let lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  if (hi - lo < 300) { const mid = (hi + lo) / 2; lo = mid - 150; hi = mid + 150; }
  const x = (k: number) => ((k - from) / (to - from)) * W;
  const y = (e: number) => T + (1 - (e - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map(([k, e], i) => `${i ? "L" : "M"}${x(k).toFixed(1)},${y(e).toFixed(1)}`).join("");
  const top = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const ticks = []; for (let k = 0; k <= to - from + 1e-6; k += 10) ticks.push(k);
  return (
    <svg class="plan-strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Profil des ${Math.round(to - from)} prochains km : de ${m0(pts[0][1])} à ${m0(top[1])} au plus haut`}>
      <defs>
        <linearGradient id="plan-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5CD6E6" stop-opacity=".32" /><stop offset="1" stop-color="#5CD6E6" stop-opacity="0" /></linearGradient>
      </defs>
      {ticks.map((k) => <line x1={x(from + k)} x2={x(from + k)} y1={T - 6} y2={H - B} class="plan-strip__grid" />)}
      <path d={`${line}L${W},${H - B}L0,${H - B}Z`} fill="url(#plan-fill)" />
      <path d={line} class="plan-strip__line" />
      {target && <g>
        <rect x={x(from)} y={T - 6} width={Math.max(0, x(target.km))} height={H - B - T + 6} class="plan-strip__day" />
        <line x1={x(target.km)} x2={x(target.km)} y1={T - 6} y2={H - B} class="plan-strip__target" />
      </g>}
      {list.filter((s) => s.kind !== "water").map((s) => {
        const e = elevAt(s.km) ?? 0, cx = x(s.km), cy = y(e);
        return s.kind === "pass"
          ? <path d={`M${cx},${cy - 9}l5,8h-10z`} fill={color(s.kind)} />
          : <circle cx={cx} cy={cy} r={s.kind === "town" ? 4.2 : 3.2} fill={color(s.kind)} stroke="#0C1526" stroke-width="1.5" />;
      })}
      {list.filter((s) => s.kind === "water").map((s) => <circle cx={x(s.km)} cy={H - B + 5} r="2.2" fill={color("water")} />)}
      <circle cx={x(from) + 1} cy={y(pts[0][1])} r="7" class="plan-strip__me-ring" />
      <circle cx={x(from) + 1} cy={y(pts[0][1])} r="4" class="plan-strip__me" />
      <text x={Math.min(W - 4, Math.max(4, x(top[0])))} y={y(top[1]) - 6} class="plan-strip__hi" text-anchor={x(top[0]) > W - 40 ? "end" : x(top[0]) < 40 ? "start" : "middle"}>{m0(top[1])}</text>
      {ticks.map((k) => <text x={x(from + k)} y={H - 4} class="plan-strip__km" text-anchor={k === 0 ? "start" : k >= to - from - 1 ? "end" : "middle"}>{k === 0 ? "toi" : `+${k} km`}</text>)}
    </svg>
  );
}

// ------------------------------------------------------------------ the page
export function PlanPage() {
  useEffect(() => { void loadPlanData(); }, []);
  const r = adminRoute.value, h = here.value;
  const ready = !!planProfile.value && planPois.value.length > 0;
  const to = Math.min(r.total, h.km + SPAN);
  const ahead = between(h.km, to);
  const { list, best } = candidates(h.km);
  const saved = plan.value;
  const [pickId, setPick] = useState<string | null>(null);
  const [date, setDate] = useState(saved && saved.date >= nzToday() ? saved.date : defaultPlanDate());
  const savedHere = saved && Math.abs(saved.fromKm - h.km) < 1 ? saved : null;
  const chosen = list.find((c) => c.s.id === (pickId ?? savedHere?.toId)) ?? best;
  const [showAll, setShowAll] = useState(false);
  const { prev, next } = r.around(h.km);
  const alt = elevAt(h.km);

  const doLocate = async () => { const err = await locate(); if (err) say(err, 4200); else say("Position trouvée", 1600); };
  const source = h.source === "gps" ? `GPS ${h.at ? ago(h.at) : ""}${h.acc ? ` · ±${h.acc} m` : ""}` : h.source === "sim" ? "Simulation" : h.label;
  const far = h.source === "gps" && (h.off ?? 0) > 2000;

  // the day
  const sum = chosen ? (() => {
    const s = chosen.s, sun = sunTimes(date, s.c);
    const day = chosen.hours * 1.15; // + breaks
    const leave = sun ? new Date(sun.set.getTime() - (day + 1) * 3600e3) : null;
    const onWay = between(h.km, s.km - 0.05, ["water", "hut", "camp", "shop", "town", "gap"]);
    const planB = between(h.km + (s.km - h.km) * 0.5, s.km * 1 - (s.km - h.km) * 0.12, ["hut", "camp"]);
    return { s, sun, day, leave, onWay, planB };
  })() : null;
  const hiNeeded = !!chosen && chosen.max - (chosen.s.e ?? elevAt(chosen.s.km) ?? 0) > 250;
  const wxTo = useWx(chosen ? chosen.s.c : null, chosen ? chosen.s.e ?? elevAt(chosen.s.km) : null);
  const wxHi = useWx(hiNeeded ? r.pointAt(chosen!.maxKm) : null, hiNeeded ? chosen!.max : null);
  const isSaved = !!(saved && chosen && saved.toId === chosen.s.id && saved.date === date && Math.abs(saved.fromKm - h.km) < 1);
  const keep = () => {
    if (!chosen) return;
    savePlan({ date, fromKm: h.km, toKm: chosen.s.km, toId: chosen.s.id, toName: chosen.s.name, toC: chosen.s.c, hours: chosen.hours, savedAt: Date.now() });
    say(`Plan gardé : ${dayLabel(date).toLowerCase()}, ${chosen.s.name}`, 2400);
  };

  // next parcel
  const parcel = parcels.value.find((p) => p.km !== null && p.km >= h.km - 0.5 && p.status !== "collected");
  const parcelWalk = parcel?.km != null ? walkHours(h.km, parcel.km) : null;

  const rows = showAll ? ahead : ahead.slice(0, 18);
  return (
    <div class="adm plan">
      <Bar title="Mon étape" />

      <section class="plan-hero" aria-live="polite">
        <p class="plan-hero__src">{source}</p>
        <p class="plan-hero__km"><span class="num">{km1(h.km)}</span> km<span class="plan-hero__of"> sur {fmtKm(r.total, "fr", 0)}</span></p>
        <p class="plan-hero__meta">
          {prev && next && prev !== next ? `Entre ${prev.n.replace(/\s*\(.*\)$/, "")} et ${next.n.replace(/\s*\(.*\)$/, "")}` : prev?.n}
          {alt !== null ? ` · ${m0(alt)} d'altitude` : ""}
        </p>
        <div class="plan-hero__bar" aria-hidden="true"><span style={{ width: `${(h.km / r.total) * 100}%` }} /></div>
        {far && <p class="plan-note">Tu es à {fmtKm((h.off ?? 0) / 1000, "fr", 0)} km du sentier : tout part du point le plus proche. Pour regarder une autre portion, passe en simulation.</p>}
        <button class="bigbtn bigbtn--secondary" type="button" disabled={locating.value} onClick={doLocate}><Locate />{locating.value ? "Recherche du GPS…" : fix.value ? "Me relocaliser" : "Me localiser"}</button>
        <div class="group plan-sim">
          <label class="cell">
            <span class="cell__main"><span class="cell__title">Simulation</span><span class="cell__meta">Choisir un km pour préparer une portion à l'avance</span></span>
            <input type="checkbox" role="switch" checked={sim.value.on} onChange={(e) => setSim({ on: (e.target as HTMLInputElement).checked, km: sim.value.on ? sim.value.km : Math.round(h.km) })} />
          </label>
          {sim.value.on && (
            <div class="cell cell--stack">
              <input type="range" min={0} max={Math.floor(r.total)} step={0.5} value={sim.value.km} aria-label="Km simulé" onInput={(e) => setSim({ km: Number((e.target as HTMLInputElement).value) })} />
              <div class="plan-sim__row">
                <button class="textbtn" type="button" onClick={() => setSim({ km: Math.max(0, sim.value.km - 10) })}>−10 km</button>
                <span class="num">km {km1(sim.value.km)}</span>
                <button class="textbtn" type="button" onClick={() => setSim({ km: Math.min(r.total, sim.value.km + 10) })}>+10 km</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {!ready && <p class="plan-note">Ouvre une fois le Carnet avec du réseau : les refuges et l'altitude seront ensuite gardés pour les jours sans signal.</p>}

      {ready && <>
        <div class="group__title">Les {Math.round(to - h.km)} prochains km</div>
        <div class="group plan-strip-box">
          <Strip from={h.km} to={to} list={ahead} target={chosen?.s ?? null} />
          <p class="plan-legend">
            {(["town", "hut", "camp", "pass", "water"] as StopKind[]).map((k) => <span><i style={{ background: color(k) }} />{k === "town" ? "Étape" : KIND_FR[k]}</span>)}
          </p>
        </div>

        <div class="group__title">Ma journée</div>
        <div class="group">
          <div class="cell">
            <div class="seg" role="group" aria-label="Pour quel jour">
              {[nzToday(), addDays(nzToday(), 1)].map((d) => <button type="button" aria-pressed={date === d} onClick={() => setDate(d)}>{dayLabel(d)}</button>)}
            </div>
          </div>
          {sum && (
            <div class="cell cell--stack plan-day">
              <p class="plan-day__to">Jusqu'à <b>{sum.s.name}</b></p>
              <p class="cell__meta">{KIND_FR[sum.s.kind]}{details(sum.s) ? ` · ${details(sum.s)}` : ""}</p>
              <dl class="plan-day__stats">
                <div><dt>Distance</dt><dd class="num">{km1(chosen!.km)} km</dd></div>
                <div><dt>Montée</dt><dd class="num">+{m0(chosen!.up)}</dd></div>
                <div><dt>Descente</dt><dd class="num">−{m0(chosen!.down)}</dd></div>
                <div><dt>Marche</dt><dd class="num">≈ {fmtHours(chosen!.hours)}</dd></div>
              </dl>
              <p class="plan-day__line">Point haut : {m0(chosen!.max)}, au km {km1(chosen!.maxKm)}.</p>
              <WxLine f={wxTo} date={date} label={`Météo là-bas`} />
              {hiNeeded && <WxLine f={wxHi} date={date} label={`Au point haut (${m0(chosen!.max)})`} />}
              {sum.sun && <p class="plan-day__line">Coucher du soleil là-bas à {nzClock(sum.sun.set)}{sum.leave ? <> : pars avant <b>{nzClock(sum.leave)}</b> pour arriver une heure avant la nuit, pauses comprises.</> : "."}</p>}
              {sum.onWay.length > 0 && <p class="plan-day__line">En chemin : {sum.onWay.slice(0, 8).map((s) => `${s.name} (${km1(s.km - h.km)} km)`).join(", ")}{sum.onWay.length > 8 ? "…" : ""}.</p>}
              {sum.planB.length > 0 && <p class="plan-day__line">Si c'est dur : {sum.planB.slice(0, 3).map((s) => `${s.name} à ${km1(s.km - h.km)} km`).join(", ")}.</p>}
              <div class="plan-day__actions">
                {isSaved
                  ? <><span class="plan-day__ok">Plan gardé pour {dayLabel(date).toLowerCase()}</span><button class="textbtn" type="button" onClick={() => { savePlan(null); say("Plan effacé", 1500); }}>Effacer</button></>
                  : <button class="bigbtn bigbtn--primary" type="button" onClick={keep}>Garder ce plan</button>}
              </div>
            </div>
          )}
          {!sum && <div class="cell"><span class="cell__meta">Pas de refuge, de camping ni d'étape entre 5 et 45 km devant toi.</span></div>}
        </div>
        {list.length > 0 && <>
          <div class="group__title">Où dormir</div>
          <div class="group">
            {list.map((c) => (
              <button class="cell plan-row" type="button" aria-pressed={chosen?.s.id === c.s.id} onClick={() => setPick(c.s.id)}>
                <i class="plan-dot" style={{ background: color(c.s.kind) }} aria-hidden="true" />
                <span class="cell__main">
                  <span class="cell__title">{c.s.name}{best?.s.id === c.s.id && <span class="plan-tag">Suggéré</span>}</span>
                  <span class="cell__meta">{km1(c.km)} km · +{m0(c.up)} · ≈ {fmtHours(c.hours)}</span>
                </span>
                {chosen?.s.id === c.s.id && <span class="plan-check" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </>}

        <div class="group__title">Ce qui m'attend</div>
        <div class="group">
          {ahead.length === 0 && <div class="cell"><span class="cell__meta">Rien de connu sur cette portion.</span></div>}
          {rows.map((s) => {
            const c = climb(h.km, s.km), d = details(s);
            return (
              <div class="cell plan-row">
                <i class="plan-dot" style={{ background: color(s.kind) }} aria-hidden="true" />
                <span class="cell__main">
                  <span class="cell__title">{s.name}</span>
                  <span class="cell__meta">{[`dans ${km1(s.km - h.km)} km`, c.up >= 5 ? `+${m0(c.up)}` : "", c.down >= 5 ? `−${m0(c.down)}` : "", d].filter(Boolean).join(" · ")}</span>
                </span>
                {s.e !== null && <span class="plan-alt num">{m0(s.e)}</span>}
              </div>
            );
          })}
          {ahead.length > rows.length && <button class="cell" type="button" onClick={() => setShowAll(true)}><span class="cell__title textbtn">Voir les {ahead.length - rows.length} autres</span></button>}
        </div>
        <p class="plan-note">Les ruisseaux et les réservoirs des refuges ne sont pas tous dans la carte : pour l'eau et l'état des gués, fie-toi à l'appli officielle du Te Araroa.</p>
      </>}

      <div class="group__title">Mon allure</div>
      <div class="group">
        <div class="cell cell--stack">
          <div class="seg" role="group" aria-label="Allure">
            {(["auto", "calm", "normal", "fast"] as PacePreset[]).map((p) => <button type="button" aria-pressed={prefs.value.pace === p} onClick={() => setPrefs({ pace: p })}>{PACE_LABEL[p]}</button>)}
          </div>
          <p class="cell__meta" style={{ marginTop: "8px" }}>
            {prefs.value.pace === "auto"
              ? learned.value ? `Calculée sur tes ${learned.value.days} dernières étapes : ${factor.value > 1 ? `${Math.round((factor.value - 1) * 100)} % plus lent` : `${Math.round((1 - factor.value) * 100)} % plus rapide`} que la règle (4 km/h, 600 m de montée par heure).`
                : "Normale tant que tu n'as pas publié d'étapes avec un temps de marche, puis calculée sur ton vrai rythme."
              : `Règle de base : 4 km/h et 600 m de montée par heure, ${factor.value === 1 ? "sans correction" : `× ${factor.value.toLocaleString("fr-FR")}`}.`}
          </p>
        </div>
        <div class="cell">
          <span class="cell__main"><span class="cell__title">Heures de marche par jour</span></span>
          <div class="seg plan-hours" role="group" aria-label="Heures de marche par jour">
            {[6, 7, 8, 9, 10].map((n) => <button type="button" aria-pressed={prefs.value.hours === n} onClick={() => setPrefs({ hours: n })}>{n}</button>)}
          </div>
        </div>
      </div>

      <div class="group__title">Prochain colis</div>
      <div class="group">
        <button class="cell" type="button" onClick={() => open({ name: "parcels" })}>
          <span class="cell__main">
            <span class="cell__title">{parcel ? parcel.place : "Aucun colis devant toi"}</span>
            <span class="cell__meta">{parcel?.km != null && parcelWalk
              ? `km ${km1(parcel.km)}, dans ${km1(parcel.km - h.km)} km : ≈ ${Math.max(1, Math.ceil(parcelWalk.hours / prefs.value.hours))} jour${Math.ceil(parcelWalk.hours / prefs.value.hours) > 1 ? "s" : ""} de nourriture à ton allure`
              : "Tes colis, et les longues portions sans magasin"}</span>
          </span>
          <ChevronRight class="cell__chev" />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ on the Carnet's home
export function PlanCard() {
  useEffect(() => { void loadPlanData(); }, []);
  const h = here.value, p = plan.value, today = nzToday();
  const live = p && p.date >= today ? p : null;
  return (
    <button class="plan-card" type="button" onClick={() => open({ name: "plan" })}>
      <span class="plan-card__main">
        <span class="plan-card__title">Mon étape</span>
        <span class="plan-card__km"><b class="num">km {km1(h.km)}</b> · {h.source === "gps" ? "GPS" : h.label}</span>
        <span class="plan-card__next">{live ? `${dayLabel(live.date)} : ${live.toName}, ${km1(live.toKm - live.fromKm)} km, ≈ ${fmtHours(live.hours)}` : "Prépare ta journée de demain"}</span>
      </span>
      <ChevronRight class="cell__chev" />
    </button>
  );
}
