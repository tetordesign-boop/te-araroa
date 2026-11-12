// "Aperçu": a day as the site will show it, before (or without) making it visible. The site's own day page content
// (ui/DayBody.tsx), fed from the draft on the phone: photos not sent yet come from the phone itself.
import { useEffect, useMemo, useState } from "preact/hooks";
import { lang, setLang } from "../i18n";
import type { Day, Media } from "../types";
import { DayBody } from "../ui/DayBody";
import { ChevronLeft } from "../ui/icons";
import { goBackOr } from "./nav";
import { adminRoute } from "./server";
import { drafts, getBlob, type Draft } from "./store";

/** Local pictures of the draft (keys in the phone's store) as addresses the page can show; freed on leaving. */
function useBlobUrls(d: Draft | undefined) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const keys = [...(d?.media ?? []).flatMap((m) => (m.uploaded ? [] : [m.mainKey, m.thumbKey])), d && !d.voiceUploaded ? d.voiceKey : null]
    .filter((k): k is string => !!k);
  const sig = keys.join("|");
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    Promise.all(keys.map(async (k) => {
      const b = await getBlob(k).catch(() => undefined);
      if (!b) return null;
      const u = URL.createObjectURL(b);
      made.push(u);
      return [k, u] as const;
    })).then((pairs) => { if (alive) setUrls(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p))); });
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [sig]);
  return urls;
}

export function Preview({ id }: { id: string }) {
  const d = drafts.value.find((x) => x.id === id);
  const urls = useBlobUrls(d);
  // (the Carnet speaks French; the preview follows the site's language switch, and puts it back after)
  const [l0] = useState(lang.value);
  useEffect(() => () => setLang(l0), []);

  const view = useMemo(() => {
    if (!d) return null;
    const { media: dm, removedMedia: _r, status: _s, ...fields } = d as Draft & Record<string, unknown>;
    const day = { ...fields, created_at: "", updated_at: "" } as unknown as Day;
    const media: Media[] = dm
      .filter((m) => m.kind === "embed" ? !!m.embed_url : m.uploaded ? !!(m.path || m.thumb_path) : !!(m.mainKey || m.thumbKey))
      .map((m) => ({
        id: m.id, day_id: d.id, kind: m.kind,
        path: m.uploaded ? m.path : m.mainKey ? urls[m.mainKey] ?? null : null,
        thumb_path: m.uploaded ? m.thumb_path : m.thumbKey ? urls[m.thumbKey] ?? null : null,
        embed_url: m.embed_url, width: m.width, height: m.height, duration_s: m.duration_s, taken_at: m.taken_at,
        lng: m.lng, lat: m.lat, caption: m.caption, caption_en: null, sort: m.sort,
      }))
      .sort((a, b) => a.sort - b.sort);
    const cover = media.find((m) => m.id === d.cover_media_id) ?? media.find((m) => m.kind === "photo") ?? media[0] ?? null;
    const leg = d.start_km !== null ? adminRoute.value.legAt(d.start_km + 0.2) : null;
    return { day, media, cover, leg };
  }, [d, urls]);

  if (!d || !view) {
    return (
      <div class="adm">
        <div class="adm-bar"><span class="adm-bar__left"><button class="textbtn" type="button" onClick={() => goBackOr({ name: "home" })}><ChevronLeft />Carnet</button></span></div>
        <p class="empty">Cette étape n'est plus sur ce téléphone.</p>
      </div>
    );
  }

  return (
    <div class="adm adm--preview">
      <div class="adm-bar">
        <span class="adm-bar__left"><button class="textbtn" type="button" onClick={() => goBackOr({ name: "editor", id })}><ChevronLeft />Jour {d.day_number}</button></span>
        <h1 class="adm-bar__title">Aperçu</h1>
        <span class="adm-bar__right">
          <button class="textbtn" type="button" onClick={() => setLang(lang.value === "fr" ? "en" : "fr")}>{lang.value === "fr" ? "EN" : "FR"}</button>
        </span>
      </div>
      <p class="adm-sub preview__note">
        {d.published
          ? "Comme tes proches la verront une fois publiée. En dessous, ils auront les cœurs et « Écrivez-moi un mot »."
          : "Comme elle serait sur le site. « Visible sur le site » est éteint : pour l'instant, personne d'autre ne la voit."}
      </p>
      <div class="preview__frame">
        <article class="day">
          <DayBody d={view.day} media={view.media} cover={view.cover} leg={view.leg} voiceSrc={d.voiceKey && !d.voiceUploaded ? urls[d.voiceKey] ?? null : null} />
        </article>
      </div>
    </div>
  );
}
