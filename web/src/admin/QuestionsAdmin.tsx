// "Questions": what family and friends ask from the site. Nobody else sees a question until I answer it; an answer
// shown on the site appears on its "Vos questions" page with the first name it was signed with. Reading and answering
// need a signal; an answer being written stays on the phone (one draft per question) until it is sent.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { MOCK } from "../config";
import { relTime } from "../lib/format";
import type { Question } from "../types";
import { features } from "./features";
import { open, say } from "./nav";
import { Bar } from "./Pages";
import { sba } from "./sb";

export const adminQuestions = signal<Question[] | null>(null);
export const questionsFailed = signal(false);

export async function loadAdminQuestions() {
  if (MOCK) { adminQuestions.value ??= [...(await import("../dev/mock")).mockQuestions(), { id: "q4", author: "Tom", body: "Tu as vu des kiwis ?", answer: null, answer_en: null, published: false, answered_at: null, created_at: new Date(Date.now() - 3600_000).toISOString() }]; return; }
  if (features.value.db !== true) return;
  const { data, error } = await sba.from("questions").select("id,author,body,answer,answer_en,published,answered_at,created_at").order("created_at", { ascending: false }).limit(300);
  if (error) { questionsFailed.value = true; return; }
  questionsFailed.value = false;
  adminQuestions.value = (data ?? []) as Question[];
}
/** the questions waiting for an answer (for the home screen) */
export const waitingQuestions = () => (adminQuestions.value ?? []).filter((q) => !q.answer).length;

export function QuestionsAdmin() {
  useEffect(() => { loadAdminQuestions(); }, []);
  if (features.value.db === false) {
    return (
      <div class="adm">
        <Bar title="Questions" />
        <p class="adm-sub" style={{ marginTop: "8px" }}>Les questions sont à activer d'abord, une fois pour toutes.</p>
        <button class="bigbtn bigbtn--primary" type="button" onClick={() => open({ name: "activate" })}>Activer les nouveautés</button>
      </div>
    );
  }
  const list = adminQuestions.value;
  const todo = (list ?? []).filter((q) => !q.answer);
  const done = (list ?? []).filter((q) => q.answer);
  return (
    <div class="adm">
      <Bar title="Questions" />
      <p class="adm-sub" style={{ marginTop: "8px" }}>
        Ce que tes proches te demandent depuis le site. Personne d'autre ne les voit tant que tu n'y as pas répondu. Une réponse affichée apparaît sur la page «&nbsp;Vos questions&nbsp;» du site, avec le prénom.
      </p>
      {questionsFailed.value && !list ? <p class="adm-sub">Pas de réseau pour l'instant : les questions arriveront dès qu'il revient.</p>
        : list === null ? <p class="adm-sub">Chargement…</p>
        : list.length === 0 ? <p class="adm-sub">Aucune question pour l'instant. Celles de tes proches arriveront ici.</p> : (
          <>
            {todo.length > 0 && <>
              <div class="group__title">À répondre</div>
              <div class="group">{todo.map((q) => <QuestionCell q={q} key={q.id} />)}</div>
            </>}
            {done.length > 0 && <>
              <div class="group__title">Répondues</div>
              <div class="group">{done.map((q) => <QuestionCell q={q} key={q.id} />)}</div>
            </>}
          </>
        )}
    </div>
  );
}

function QuestionCell({ q }: { q: Question }) {
  const key = `ta-answer-${q.id}`;
  const stored = () => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const [editing, setEditing] = useState(() => stored() !== null);
  const [fr, setFr] = useState(() => stored() ?? q.answer ?? "");
  const [en, setEn] = useState(q.answer_en ?? "");
  const [showEn, setShowEn] = useState(!!q.answer_en);
  const [shown, setShown] = useState(q.answer ? q.published : true);
  const [busy, setBusy] = useState(false);
  const keep = (v: string) => { setFr(v); try { localStorage.setItem(key, v); } catch (_) { /* ignore */ } };

  const save = async () => {
    if (!fr.trim()) { say("Écris d'abord ta réponse."); return; }
    if (!navigator.onLine) { say("Pas de réseau : ta réponse reste sur ce téléphone. Réessaie quand tu en as.", 3600); return; }
    setBusy(true);
    const row = { answer: fr.trim(), answer_en: en.trim() || null, published: shown, answered_at: q.answered_at ?? new Date().toISOString() };
    const { error } = MOCK ? { error: null } : await sba.from("questions").update(row).eq("id", q.id);
    setBusy(false);
    if (error) { say("Pas envoyé : vérifie le réseau et réessaie."); return; }
    try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
    if (MOCK) adminQuestions.value = (adminQuestions.value ?? []).map((x) => (x.id === q.id ? { ...x, ...row } : x));
    say(shown ? "Réponse publiée sur le site." : "Réponse enregistrée, pas affichée sur le site.");
    setEditing(false);
    if (!MOCK) loadAdminQuestions();
  };
  const remove = async () => {
    if (!confirm(`Supprimer la question de ${q.author} ?`)) return;
    const { error } = MOCK ? { error: null } : await sba.from("questions").delete().eq("id", q.id);
    if (error) { say("Pas supprimée : vérifie le réseau et réessaie."); return; }
    try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
    adminQuestions.value = (adminQuestions.value ?? []).filter((x) => x.id !== q.id);
    say("Question supprimée");
  };

  const state = q.answer ? (q.published ? ", sur le site" : ", pas affichée") : "";
  return (
    <div class="cell cell--stack qcell">
      <span class="cell__title"><strong>{q.author}</strong></span>
      <span class="cell__meta">{relTime(q.created_at, "fr")}{state}</span>
      <span class="voice qcell__q">{q.body}</span>
      {!editing ? (
        <>
          {q.answer && <span class="qcell__a">{q.answer}</span>}
          <div class="pickrow">
            <button class="btn" type="button" onClick={() => setEditing(true)}>{q.answer ? "Modifier" : "Répondre"}</button>
            <button class="btn danger" type="button" onClick={remove}>Supprimer</button>
          </div>
        </>
      ) : (
        <div class="qcell__form">
          <label class="cell cell--stack">
            <span class="sr-only">Ta réponse</span>
            <textarea class="short" value={fr} placeholder="Ta réponse… (le micro du clavier marche très bien)" onInput={(e) => keep((e.target as HTMLTextAreaElement).value)} />
          </label>
          {showEn ? (
            <label class="cell cell--stack">
              <span class="sr-only">Réponse en anglais</span>
              <textarea class="short" value={en} placeholder="Answer in English (optional)" onInput={(e) => setEn((e.target as HTMLTextAreaElement).value)} />
            </label>
          ) : (
            <button class="textbtn" type="button" style={{ textAlign: "left" }} onClick={() => setShowEn(true)}>Ajouter une version anglaise</button>
          )}
          <label class="switchrow">
            <span class="switchrow__text">Afficher sur le site<small>{shown ? "Avec la question et le prénom, sur la page « Vos questions »." : "Rien n'apparaît sur le site : la réponse reste ici."}</small></span>
            <input type="checkbox" role="switch" checked={shown} onChange={(e) => setShown((e.target as HTMLInputElement).checked)} />
          </label>
          <div class="pickrow">
            <button class="btn" type="button" onClick={() => { setEditing(false); setFr(q.answer ?? ""); try { localStorage.removeItem(key); } catch (_) { /* ignore */ } }}>Annuler</button>
            <button class="btn btn--primary" type="button" disabled={busy} onClick={save}>{busy ? "Envoi…" : shown ? "Publier" : "Enregistrer"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
