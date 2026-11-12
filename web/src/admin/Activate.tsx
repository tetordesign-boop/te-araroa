// "Nouveautés à activer": the questions, the voice note of the day and the notifications need, once, a script run in
// the database and the "push" server function added in Supabase. Both are done from the phone, with what this page
// copies (built from supabase/ by vite.config.ts); it checks for itself whether each is in place. Once they are, it
// is the notifications' page: how many phones are told at each new day.
import { useEffect, useState } from "preact/hooks";
import { MOCK } from "../config";
import { relTime } from "../lib/format";
import { checkFeatures, features } from "./features";
import { say } from "./nav";
import { Bar, CopyBtn } from "./Pages";
import { sba } from "./sb";

type Texts = { FEATURES_SQL: string; PUSH_FUNCTION: string };

function Status({ ok, todo }: { ok: boolean | "jwt" | null; todo?: string }) {
  if (ok === true) return <span class="act__ok">Fait</span>;
  if (ok === "jwt") return <span class="act__todo">Presque</span>;
  return <span class="act__todo">{todo ?? "À faire"}</span>;
}

export function Activate() {
  const f = features.value;
  const [texts, setTexts] = useState<Texts | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<{ phones: number; last_sent: string | null; last_phones: number | null } | null>(null);
  useEffect(() => {
    import("virtual:activation").then((m) => setTexts(m as Texts));
    checkFeatures();
  }, []);
  const ready = f.db === true && f.push === true;
  useEffect(() => {
    if (!ready) return;
    if (MOCK) { setStats({ phones: 14, last_sent: new Date(Date.now() - 5 * 3600_000).toISOString(), last_phones: 13 }); return; }
    sba.rpc("push_stats").then(({ data }) => { const r = (data as typeof stats[] | null)?.[0]; if (r) setStats(r); });
  }, [ready]);

  const verify = async () => {
    setBusy(true);
    const r = await checkFeatures();
    setBusy(false);
    say(r.db === true && r.push === true ? "Tout est actif."
      : r.db !== true ? "Le script n'a pas encore été lancé (étape 1)."
      : r.push === "jwt" ? "La fonction est là : éteins encore « Verify JWT » (étape 2)."
      : "La fonction « push » ne répond pas encore (étape 2).", 3600);
  };

  if (ready) {
    return (
      <div class="adm">
        <Bar title="Notifications" />
        <p class="adm-sub" style={{ marginTop: "8px" }}>
          Tes proches s'inscrivent depuis le site («&nbsp;Être prévenu de chaque étape&nbsp;», sur l'accueil avant ton départ et dans «&nbsp;À propos&nbsp;»). Ensuite, chaque étape que tu publies leur envoie une notification, toute seule.
        </p>
        <div class="group">
          <div class="cell"><span class="cell__main"><span class="cell__title">Téléphones inscrits</span></span><span class="cell__value num">{stats ? stats.phones : "…"}</span></div>
          <div class="cell"><span class="cell__main"><span class="cell__title">Dernière notification</span><span class="cell__meta">{stats?.last_sent ? `${relTime(stats.last_sent, "fr")}, ${stats.last_phones ?? 0} téléphone${(stats.last_phones ?? 0) > 1 ? "s" : ""}` : "Aucune pour l'instant"}</span></span></div>
        </div>
        <ul class="adm-list">
          <li>Seules les étapes datées de ton départ ou après sont annoncées : un essai fait avant ne prévient personne.</li>
          <li>Plusieurs jours envoyés d'un coup (au retour du réseau) font une seule notification.</li>
          <li>Une étape n'est annoncée qu'une fois, même si tu la modifies ensuite.</li>
          <li>«&nbsp;Visible sur le site&nbsp;» éteint : pas de notification, jusqu'à ce que tu l'allumes.</li>
        </ul>
      </div>
    );
  }

  return (
    <div class="adm act">
      <Bar title="Nouveautés à activer" />
      <p class="adm-sub" style={{ marginTop: "8px" }}>
        Trois nouveautés pour tes proches : leurs questions, ton message vocal du jour, et une notification à chaque étape. Elles s'activent une fois pour toutes, en deux étapes dans Supabase, depuis ce téléphone.
      </p>

      <div class="group__title act__head">1. Le script de la base <Status ok={f.db} /></div>
      <div class="group">
        <ol class="steps">
          <li>Copie le script : {texts ? <CopyBtn text={texts.FEATURES_SQL} what="Le script" /> : "…"}</li>
          <li>Sur supabase.com, ouvre ton projet, puis <strong>SQL Editor</strong> et <strong>New query</strong>.</li>
          <li>Colle le script et touche <strong>Run</strong>. «&nbsp;Success. No rows returned&nbsp;» : c'est bon.</li>
        </ol>
      </div>

      <div class="group__title act__head">2. La fonction des notifications <Status ok={f.push} /></div>
      <div class="group">
        <ol class="steps">
          <li>Copie la fonction : {texts ? <CopyBtn text={texts.PUSH_FUNCTION} what="La fonction" /> : "…"}</li>
          <li>Dans Supabase : <strong>Edge Functions</strong>, puis <strong>Deploy a new function</strong> et <strong>Via Editor</strong>.</li>
          <li>Remplace tout le code par celui copié, nomme la fonction exactement <span class="code">push</span>, puis <strong>Deploy function</strong>.</li>
          <li>Dans la fonction <span class="code">push</span>, ouvre ses réglages et éteins <strong>Verify JWT</strong> (ou «&nbsp;Enforce JWT verification&nbsp;»), puis enregistre. Les téléphones de tes proches doivent pouvoir lui parler sans compte.</li>
        </ol>
      </div>
      {f.push === "jwt" && <p class="warn" style={{ margin: "-10px 16px 18px" }}>La fonction est en place, mais «&nbsp;Verify JWT&nbsp;» est encore allumé.</p>}

      <button class="bigbtn bigbtn--primary" type="button" disabled={busy} onClick={verify}>{busy ? "Vérification…" : "Vérifier"}</button>
      <p class="adm-sub" style={{ marginTop: "12px" }}>Rien ne change pour tes proches tant que ce n'est pas fait : ces nouveautés restent cachées sur le site.</p>
    </div>
  );
}
