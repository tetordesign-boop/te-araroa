import { useEffect } from "preact/hooks";
import { mediaUrl } from "../config";
import { lang, t } from "../i18n";
import type { Media } from "../types";
import { Play } from "./icons";

function youtubeId(url: string): string | null {
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/.exec(url);
  return m ? m[1] : null;
}

function embedHtml(url: string): string {
  const yt = youtubeId(url);
  if (yt) return `<iframe src="https://www.youtube-nocookie.com/embed/${yt}?playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Vidéo"></iframe>`;
  const vm = /vimeo\.com\/(\d+)/.exec(url);
  if (vm) return `<iframe src="https://player.vimeo.com/video/${vm[1]}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Vidéo"></iframe>`;
  return `<a href="${encodeURI(url)}" target="_blank" rel="noopener" style="color:#fff;font:600 17px system-ui">${t("openVideo")}</a>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function openLightbox(list: Media[], index: number) {
  const [{ default: PhotoSwipeLightbox }] = await Promise.all([import("photoswipe/lightbox"), import("photoswipe/style.css")]);
  const l = lang.value;
  const dataSource = list.map((m) => {
    if (m.kind === "video") {
      return { html: `<div class="pswp__video"><video src="${esc(mediaUrl(m.path))}" poster="${esc(mediaUrl(m.thumb_path))}" controls playsinline preload="metadata"></video></div>` };
    }
    if (m.kind === "embed" && m.embed_url) return { html: `<div class="pswp__video">${embedHtml(m.embed_url)}</div>` };
    return { src: mediaUrl(m.path), msrc: mediaUrl(m.thumb_path ?? m.path), width: m.width ?? 1600, height: m.height ?? 1200, alt: m.caption ?? t("photoBy") };
  });
  const captions = list.map((m) => (l === "en" && m.caption_en) || m.caption || "");
  const lb = new PhotoSwipeLightbox({
    dataSource,
    pswpModule: () => import("photoswipe"),
    bgOpacity: 0.94,
    showHideAnimationType: "fade",
    closeTitle: t("close"),
    zoomTitle: "Zoom",
    arrowPrevTitle: "←",
    arrowNextTitle: "→",
    errorMsg: "Image indisponible",
    padding: { top: 40, bottom: 70, left: 0, right: 0 },
  });
  lb.on("uiRegister", () => {
    lb.pswp?.ui?.registerElement({
      name: "custom-caption", order: 9, isButton: false, appendTo: "root",
      onInit: (el, pswp) => {
        el.className = "pswp__custom-caption";
        const upd = () => { el.textContent = captions[pswp.currIndex] ?? ""; };
        pswp.on("change", upd);
        upd();
      },
    });
  });
  lb.on("change", () => {
    const cur = lb.pswp?.currSlide?.container;
    document.querySelectorAll<HTMLVideoElement>(".pswp video").forEach((v) => { if (!cur?.contains(v)) v.pause(); });
    document.querySelectorAll<HTMLIFrameElement>(".pswp iframe").forEach((f) => {
      if (!cur?.contains(f)) f.src = f.src; // stop embedded players on other slides
    });
  });
  lb.on("destroy", () => document.querySelectorAll<HTMLVideoElement>(".pswp video").forEach((v) => v.pause()));
  lb.init();
  lb.loadAndOpen(index);
}

function Thumb({ m, hero, onOpen }: { m: Media; hero?: boolean; onOpen: () => void }) {
  const src = mediaUrl(hero ? (m.path && m.kind === "photo" ? m.path : m.thumb_path ?? m.path) : (m.thumb_path ?? m.path));
  const isVideo = m.kind !== "photo";
  return (
    <button type="button" class={hero ? "hero" : "grid__item"} onClick={onOpen}
      aria-label={isVideo ? t("playVideo") : (m.caption || t("photoBy"))}>
      {src ? <img src={src} alt="" loading={hero ? "eager" : "lazy"} decoding="async" /> : null}
      {isVideo && <span class="play-badge"><Play /></span>}
    </button>
  );
}

export function Gallery({ list, cover, openId }: { list: Media[]; cover: Media | null; openId?: string }) {
  const ordered = cover ? [cover, ...list.filter((m) => m.id !== cover.id)] : list;
  useEffect(() => {
    if (!openId) return;
    const i = ordered.findIndex((m) => m.id === openId);
    if (i >= 0) openLightbox(ordered, i);
  }, [openId]);
  if (!ordered.length) return null;
  const [first, ...rest] = ordered;
  return (
    <div class="gallery">
      <Thumb m={first} hero onOpen={() => openLightbox(ordered, 0)} />
      {rest.length > 0 && (
        <div class="grid">
          {rest.map((m, i) => <Thumb m={m} onOpen={() => openLightbox(ordered, i + 1)} />)}
        </div>
      )}
      {first.caption && <p class="caption">{(lang.value === "en" && first.caption_en) || first.caption}</p>}
    </div>
  );
}
