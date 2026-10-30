import { useEffect } from "preact/hooks";
import { mediaUrl } from "../config";
import { lang, t } from "../i18n";
import { typo } from "../lib/format";
import type { Media } from "../types";
import { Play } from "./icons";

function youtubeId(url: string): string | null {
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/.exec(url);
  return m ? m[1] : null;
}

function embedHtml(url: string): string {
  const yt = youtubeId(url);
  if (yt) return `<iframe src="https://www.youtube-nocookie.com/embed/${yt}?playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="${t("video")}"></iframe>`;
  const vm = /vimeo\.com\/(\d+)/.exec(url);
  if (vm) return `<iframe src="https://player.vimeo.com/video/${vm[1]}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${t("video")}"></iframe>`;
  return `<a href="${encodeURI(url)}" target="_blank" rel="noopener" style="color:#fff;font:600 17px system-ui">${t("openVideo")}</a>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function openLightbox(list: Media[], index: number) {
  const [{ default: PhotoSwipeLightbox }] = await Promise.all([import("photoswipe/lightbox"), import("photoswipe/style.css")]);
  const l = lang.value;
  const dataSource = list.map((m) => {
    if (m.kind === "video") {
      return { html: `<div class="pswp__video"><video src="${esc(mediaUrl(m.path))}" poster="${esc(mediaUrl(m.thumb_path))}" controls playsinline preload="none"></video></div>` };
    }
    if (m.kind === "embed" && m.embed_url) return { html: `<div class="pswp__video">${embedHtml(m.embed_url)}</div>` };
    return { src: mediaUrl(m.path), msrc: mediaUrl(m.thumb_path ?? m.path), width: m.width ?? 1600, height: m.height ?? 1200, alt: m.caption ?? t("photoBy") };
  });
  const captions = list.map((m) => typo((l === "en" && m.caption_en) || m.caption || ""));
  const lb = new PhotoSwipeLightbox({
    dataSource,
    pswpModule: () => import("photoswipe"),
    bgOpacity: 0.94,
    showHideAnimationType: "fade",
    closeTitle: t("close"),
    zoomTitle: t("zoom"),
    arrowPrevTitle: t("photoPrev"),
    arrowNextTitle: t("photoNext"),
    errorMsg: t("photoMissing"),
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

/** Split n tiles into rows of three and two, never leaving a tile alone on its row. */
export function rowSizes(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (n === 2) return [2];
  if (n === 4) return [2, 2];
  const rows: number[] = [];
  let left = n;
  while (left > 0) {
    if (left === 4) { rows.push(2, 2); break; }
    if (left === 2) { rows.push(2); break; }
    rows.push(3);
    left -= 3;
  }
  return rows;
}

const MAX_TILES = 9;

function Tile({ m, hero, wide, more, onOpen }: { m: Media; hero?: boolean; wide?: boolean; more?: number; onOpen: () => void }) {
  const big = hero || wide;
  const src = mediaUrl(big && m.kind === "photo" && m.path ? m.path : m.thumb_path ?? m.path);
  const isVideo = m.kind !== "photo";
  const portrait = hero && m.width && m.height ? m.height > m.width * 1.05 : false;
  return (
    <button type="button" class={`tile${hero ? " tile--hero" : ""}${portrait ? " is-portrait" : ""}`} onClick={onOpen}
      aria-label={more ? t("photosN", { n: more + 1 }) : isVideo ? t("playVideo") : (m.caption || t("photoBy"))}>
      {src ? <img src={src} alt="" loading={hero ? "eager" : "lazy"} decoding="async" /> : null}
      {isVideo && !more && <span class="play-badge"><Play /></span>}
      {more ? <span class="tile__more num">+{more}</span> : null}
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
  const visible = rest.slice(0, MAX_TILES);
  const extra = rest.length - visible.length;
  const rows = rowSizes(visible.length);
  let k = 0;
  return (
    <div class="gallery">
      <div class="mosaic">
        <Tile m={first} hero onOpen={() => openLightbox(ordered, 0)} />
        {rows.map((size) => {
          const items = visible.slice(k, k + size);
          const startIdx = k;
          k += size;
          return (
            <div class={`mosaic__row n${size}`}>
              {items.map((m, i) => {
                const idx = startIdx + i + 1;
                const last = extra > 0 && startIdx + i === visible.length - 1;
                return <Tile m={m} wide={size === 1} more={last ? extra : undefined} onOpen={() => openLightbox(ordered, idx)} />;
              })}
            </div>
          );
        })}
      </div>
      {first.caption && <p class="caption">{typo((lang.value === "en" && first.caption_en) || first.caption)}</p>}
    </div>
  );
}
