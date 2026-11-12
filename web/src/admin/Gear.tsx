// The Carnet's "Mon sac": Ewan's gear list for the site's pack page, kept in settings.gear.
// Edits stay on the phone (a draft) until OK; a pasted list (Notes, LighterPack CSV) fills it in one go.

import { useState } from "preact/hooks";
import { MOCK, mediaUrl } from "../config";
import { fmtInt } from "../lib/format";
import { fmtWeight, GEAR_CATS, gearTotals, itemG, newId, parseGearList, sectionG, type Gear, type GearCat, type GearItem } from "../lib/gear";
import { preparePhoto } from "./media";
import { say } from "./nav";
import { Bar, CopyBtn } from "./Pages";
import { sba } from "./sb";
import { adminSettings, loadServer } from "./server";

export const CAT_FR: Record<GearCat, string> = {
  pack: "Sac et rangement", sleep: "Dormir", kitchen: "Cuisine", water: "Eau", clothes: "Vêtements",
  tech: "Électronique", care: "Soins et hygiène", misc: "Divers", food: "Nourriture et gaz",
};
/** the one line the database needs before the list can be saved (supabase/migrations/20261110000100_gear.sql) */
export const GEAR_SQL = "alter table public.settings add column if not exists gear jsonb;";
const DRAFT = "gear-draft-v1";

const readDraft = (): Gear | null => { try { const s = localStorage.getItem(DRAFT); return s ? (JSON.parse(s) as Gear) : null; } catch { return null; } };
const writeDraft = (g: Gear | null) => { try { if (g) localStorage.setItem(DRAFT, JSON.stringify(g)); else localStorage.removeItem(DRAFT); } catch { /* private mode */ } };
/** the column is there once the settings row carries the key (even empty) */
export const gearReady = () => { const s = adminSettings.value; return !!s && Object.prototype.hasOwnProperty.call(s, "gear"); };
const digits = (v: string) => parseInt(v.replace(/[^\d]/g, ""), 10) || 0;

export function GearPage() {
  const ready = gearReady();
  const server: Gear = adminSettings.value?.gear ?? { items: [] };
  const [g, setG] = useState<Gear>(() => readDraft() ?? server);
  const [dirty, setDirty] = useState(() => !!readDraft());
  const [openId, setOpenId] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const change = (next: Gear) => { setG(next); setDirty(true); writeDraft(next); };
  const setItem = (id: string, patch: Partial<GearItem>) => change({ ...g, items: g.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const add = (cat: GearCat) => { const it: GearItem = { id: newId(), cat, name: "", g: 0 }; change({ ...g, items: [...g.items, it] }); setOpenId(it.id); };
  const remove = (i: GearItem) => {
    if (i.name && !confirm(`Retirer « ${i.name} » de ta liste ?`)) return;
    change({ ...g, items: g.items.filter((x) => x.id !== i.id) }); setOpenId(null);
  };

  const save = async () => {
    if (!ready) { say("Prépare d'abord la base (en haut de la page)."); return; }
    setSaving(true);
    const clean: Gear = {
      ...g,
      note_fr: g.note_fr?.trim() || null, note_en: g.note_en?.trim() || null,
      items: g.items.filter((i) => i.name.trim()).map((i) => ({
        id: i.id, cat: i.cat, name: i.name.trim(), detail: i.detail?.trim() || null, name_en: i.name_en?.trim() || null, note: i.note?.trim() || null,
        g: Math.max(0, Math.round(Number(i.g) || 0)), qty: Math.max(1, Math.round(Number(i.qty) || 1)), ...(i.worn ? { worn: true } : {}),
      })),
    };
    const { error } = MOCK ? { error: null } : await sba.from("settings").update({ gear: clean }).eq("id", 1);
    setSaving(false);
    if (error) { say(/column/i.test(error.message) ? "La base n'a pas encore la place pour ton sac : voir en haut de la page." : "Pas enregistré : vérifie le réseau et réessaie."); return; }
    // a photo replaced: the old file goes
    if (server.photo && server.photo !== clean.photo) sba.storage.from("media").remove([server.photo]).catch(() => {});
    writeDraft(null); setDirty(false); setG(clean); setOpenId(null);
    if (MOCK) adminSettings.value = { ...adminSettings.value!, gear: clean };
    else await loadServer();
    say("Ton sac est enregistré.");
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const p = await preparePhoto(file);
      const path = `gear/sac-${Date.now()}.jpg`;
      const { error } = await sba.storage.from("media").upload(path, p.main, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      change({ ...g, photo: path, photo_w: p.width, photo_h: p.height });
      say("Photo envoyée. Touche OK pour l'enregistrer.");
    } catch (e) {
      say(`Photo pas envoyée : ${(e as Error).message}`);
    }
    setPhotoBusy(false);
  };

  const addPasted = () => {
    const list = parseGearList(paste);
    if (!list.length) { say("Aucun objet reconnu : une ligne par objet, avec son poids."); return; }
    change({ ...g, items: [...g.items, ...list] }); setPaste("");
    say(`${list.length} ${list.length > 1 ? "objets ajoutés" : "objet ajouté"} : vérifie les catégories, puis OK.`, 4200);
  };

  const tot = gearTotals(g.items);
  const kg = (n: number) => fmtWeight(n, "fr", 2);
  return (
    <div class="adm gearedit">
      <Bar title="Mon sac" right={<button class="textbtn textbtn--strong" type="button" disabled={saving || !dirty} onClick={save}>{saving ? "…" : "OK"}</button>} />
      <p class="adm-sub" style={{ marginTop: "12px" }}>Ta liste de matériel pour la page « Mon sac » du site. Le poids qui compte est celui du sac à vide : sans ce que tu portes sur toi, ni nourriture, ni eau.</p>

      {!ready && (
        <>
          <div class="group__title">Une seule fois : préparer la base</div>
          <div class="group">
            <div class="cell cell--stack">
              <span class="cell__meta">Dans Supabase, ouvre SQL Editor, colle cette ligne et touche Run. Rien d'autre ne change.</span>
              <span class="code">{GEAR_SQL}</span>
            </div>
            <div class="cell"><CopyBtn text={GEAR_SQL} what="La ligne" /><span style={{ flex: 1 }} /><button class="textbtn" type="button" onClick={() => loadServer().then(() => say(gearReady() ? "C'est prêt." : "Pas encore : la ligne n'a pas été lancée."))}>C'est fait</button></div>
          </div>
        </>
      )}

      <div class="group__title">En tout</div>
      <div class="group">
        <div class="cell"><span>Dans le sac, à vide</span><span class="cell__value num">{kg(tot.base)}</span></div>
        <div class="cell"><span>Porté sur toi</span><span class="cell__value num">{kg(tot.worn)}</span></div>
        <div class="cell"><span>Nourriture, eau, gaz</span><span class="cell__value num">{kg(tot.food)}</span></div>
        <div class="cell"><span>Objets</span><span class="cell__value num">{fmtInt(tot.n, "fr")}</span></div>
      </div>

      <div class="group__title">La photo de tout ton matériel</div>
      <div class="group">
        {g.photo && <div class="cell cell--stack"><img class="gearedit__photo" src={mediaUrl(g.photo)} alt="" /></div>}
        <label class="cell">
          <span class="cell__main">
            <span class="cell__title">{photoBusy ? "Envoi de la photo…" : g.photo ? "Changer la photo" : "Choisir une photo"}</span>
            <span class="cell__meta">Tout ton matériel posé par terre, vu d'en haut (il faut du réseau)</span>
          </span>
          <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={(e) => { const el = e.target as HTMLInputElement; pickPhoto(el.files?.[0]); el.value = ""; }} />
        </label>
        {g.photo && <button class="cell danger" type="button" onClick={() => change({ ...g, photo: null, photo_w: null, photo_h: null })}>Retirer la photo</button>}
      </div>

      <div class="group__title">Ton mot sur ton sac (facultatif)</div>
      <div class="group">
        <label class="cell cell--stack"><textarea class="short" value={g.note_fr ?? ""} placeholder="Par exemple : tout tient dans 55 litres" onInput={(e) => change({ ...g, note_fr: (e.target as HTMLTextAreaElement).value })} /></label>
        <label class="cell cell--stack"><textarea class="short" value={g.note_en ?? ""} placeholder="The same in English (optional)" onInput={(e) => change({ ...g, note_en: (e.target as HTMLTextAreaElement).value })} /></label>
      </div>

      {GEAR_CATS.map((cat) => {
        const list = g.items.filter((i) => i.cat === cat);
        const sum = sectionG(list);
        return (
          <>
            <div class="group__title">{CAT_FR[cat]}{sum > 0 ? `, ${fmtWeight(sum, "fr")}${cat === "food" ? "" : " dans le sac"}` : ""}</div>
            <div class="group">
              {list.map((i) => (openId === i.id ? <ItemEditor i={i} set={(p) => setItem(i.id, p)} close={() => setOpenId(null)} remove={() => remove(i)} /> : (
                <button class="cell" type="button" onClick={() => setOpenId(i.id)}>
                  <span class="cell__main">
                    <span class="cell__title">{i.name || "Sans nom"}{(i.qty ?? 1) > 1 ? ` ×${i.qty}` : ""}</span>
                    {(i.detail || i.worn) && <span class="cell__meta">{[i.detail, i.worn ? "porté sur toi" : null].filter(Boolean).join(", ")}</span>}
                  </span>
                  <span class="cell__value num">{i.g ? `${fmtInt(itemG(i), "fr")} g` : "? g"}</span>
                </button>
              )))}
              <button class="cell gearedit__add" type="button" onClick={() => add(cat)}>Ajouter un objet</button>
            </div>
          </>
        );
      })}

      <div class="group__title">Coller une liste</div>
      <div class="group">
        <label class="cell cell--stack">
          <span class="cell__meta">Depuis Notes : une ligne par objet avec son poids, « Tente Durston X-Mid 1, 794 g ». Une ligne « Dormir : » range celles qui suivent, « 2x » compte les paires, « (porté) » le met sur toi. Un export LighterPack (CSV) marche aussi.</span>
          <textarea class="plain" value={paste} placeholder={"Dormir :\nTente Durston X-Mid 1, 794 g\n2x Chaussettes Darn Tough, 60 g"} onInput={(e) => setPaste((e.target as HTMLTextAreaElement).value)} />
        </label>
        <button class="cell" type="button" disabled={!paste.trim()} onClick={addPasted}><span class="cell__title">Ajouter ces objets</span></button>
      </div>

      <button class="bigbtn bigbtn--primary" type="button" disabled={saving || !dirty} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
      {dirty && <p class="note" style={{ marginTop: "4px" }}>Pas encore enregistré : tes changements restent sur ce téléphone jusqu'à OK.</p>}
    </div>
  );
}

function ItemEditor({ i, set, close, remove }: { i: GearItem; set: (p: Partial<GearItem>) => void; close: () => void; remove: () => void }) {
  const val = (e: Event) => (e.target as HTMLInputElement).value;
  return (
    <div class="gearedit__item">
      <label class="cell"><span>Nom</span><input value={i.name} placeholder="Tente" autoFocus={!i.name} onInput={(e) => set({ name: val(e) })} /></label>
      <label class="cell"><span>Modèle</span><input value={i.detail ?? ""} placeholder="marque, modèle" onInput={(e) => set({ detail: val(e) })} /></label>
      <label class="cell"><span>Poids</span><input class="num" inputMode="numeric" value={i.g ? String(i.g) : ""} placeholder="en grammes" onInput={(e) => set({ g: digits(val(e)) })} /><span class="gearedit__unit">g</span></label>
      <label class="cell"><span>Combien</span><input class="num" inputMode="numeric" value={String(i.qty ?? 1)} onInput={(e) => set({ qty: Math.max(1, digits(val(e))) })} /></label>
      <label class="cell"><span>Catégorie</span>
        <select value={i.cat} onChange={(e) => set({ cat: (e.target as HTMLSelectElement).value as GearCat })}>
          {GEAR_CATS.map((c) => <option value={c}>{CAT_FR[c]}</option>)}
        </select>
      </label>
      {i.cat !== "food" && (
        <label class="switchrow">
          <span class="switchrow__text">Porté sur toi<small>Pas compté dans le sac : chaussures, vêtements du jour, bâtons, téléphone dans la poche.</small></span>
          <input type="checkbox" role="switch" checked={!!i.worn} onChange={(e) => set({ worn: (e.target as HTMLInputElement).checked || undefined })} />
        </label>
      )}
      <label class="cell"><span>En anglais</span><input value={i.name_en ?? ""} placeholder="facultatif" onInput={(e) => set({ name_en: val(e) })} /></label>
      <label class="cell cell--stack"><textarea class="short" value={i.note ?? ""} placeholder="Ton mot sur cet objet (facultatif)" onInput={(e) => set({ note: (e.target as HTMLTextAreaElement).value })} /></label>
      <div class="cell">
        <button class="textbtn danger" type="button" onClick={remove}>Retirer</button>
        <span style={{ flex: 1 }} />
        <button class="textbtn textbtn--strong" type="button" onClick={close}>Fini</button>
      </div>
    </div>
  );
}
