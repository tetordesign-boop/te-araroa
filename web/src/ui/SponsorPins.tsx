// The sponsors on the map: at each spot given to a brand, its logo turns in 3D like a coin, floating above the
// trail, its shadow narrowing as it turns edge-on. A tap opens a small card under it: the name, the place, the link
// to its site or Instagram, and the way to the trail's tickets. A spot given to someone without a logo (a friend's
// kilometre) is a small name tag instead.
// Near the top of the map (Ship Cove and the first kilometres, at the top of the whole island), a coin standing over
// its spot would sit under the header: there it hangs below its spot instead, and goes back up when there's room.
import { useEffect } from "preact/hooks";
import { lang } from "../i18n";
import { route } from "../lib/data";
import { linkLabel, logoSrc, spotById, spotCoord, taken, totalKm, type Spot, type Taken } from "../lib/sponsors";
import { go, mapApi } from "./state";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function build(spot: Spot, owner: Taken, l: "fr" | "en", close: () => void): HTMLElement {
  const logo = logoSrc(owner);
  const el = document.createElement("div");
  el.className = logo ? "spin" : "spin spin--name";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-expanded", "false");
  el.setAttribute("aria-label", `${l === "fr" ? "Sponsor" : "Sponsor"} : ${owner.name}, ${spot.name[l]}`);
  const link = owner.link ? `<a class="spin__link" href="${esc(owner.link)}" target="_blank" rel="noopener">${l === "fr" ? "Voir" : "Visit"} ${esc(linkLabel(owner.link))}</a>` : "";
  const card = `<div class="spin__card" role="group">
      ${logo ? `<img class="spin__cardlogo" src="${esc(logo)}" alt="" width="40" height="40">` : ""}
      <span class="spin__cardtext"><b>${esc(owner.name)}</b><span>${esc(spot.name[l])}</span>${link}
      <button class="spin__more" type="button">${l === "fr" ? "Les tickets du sentier" : "The trail's tickets"}</button></span>
    </div>`;
  el.innerHTML = logo
    ? `${card}<div class="spin__float"><div class="spin__coin">
        <i class="spin__edge" style="--z:-2px"></i><i class="spin__edge" style="--z:-1px"></i><i class="spin__edge" style="--z:0px"></i><i class="spin__edge" style="--z:1px"></i><i class="spin__edge" style="--z:2px"></i>
        <span class="spin__face"><img src="${esc(logo)}" alt="" draggable="false"></span>
        <span class="spin__face spin__face--back"><img src="${esc(logo)}" alt="" draggable="false"></span>
      </div></div><span class="spin__stem"></span><span class="spin__shadow"></span>`
    : `${card}<span class="spin__tag"><i></i>${esc(owner.name)}</span><span class="spin__stem"></span>`;
  // the card stays on screen, and clear of the map's buttons on the right where they're level with it
  const fitCard = () => {
    const card = el.querySelector<HTMLElement>(".spin__card");
    if (!card) return;
    const pin = el.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
    const cx = pin.left + pin.width / 2;
    const top = el.classList.contains("spin--down") ? pin.bottom + 6 : pin.top - 6 - h;
    let hi = window.innerWidth - 8;
    const ctl = document.querySelector(".controls")?.getBoundingClientRect();
    if (ctl && ctl.width && ctl.left > cx && top < ctl.bottom && top + h > ctl.top) hi = Math.min(hi, ctl.left - 8);
    const left = cx - w / 2;
    const dx = left + w > hi ? Math.max(8 - left, hi - (left + w)) : left < 8 ? 8 - left : 0;
    card.style.setProperty("--dx", `${Math.round(dx)}px`);
  };
  const toggle = (e: Event) => {
    if ((e.target as HTMLElement).closest(".spin__link")) return; // the link opens by itself
    e.stopPropagation();
    if ((e.target as HTMLElement).closest(".spin__more")) { go({ name: "sponsors" }); return; }
    const open = !el.classList.contains("is-open");
    close();
    if (open) { fitCard(); el.classList.add("is-open"); el.setAttribute("aria-expanded", "true"); el.style.zIndex = "6"; }
  };
  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } if (e.key === "Escape") close(); });
  return el;
}

/** Keeps the map's sponsor pins in step with the given spots (rendered once, beside the map; draws nothing itself). */
export function SponsorPins() {
  const m = mapApi.value, t = taken.value, l = lang.value, r = route.value;
  // the kilometres are worked out from the trail's data, which may still be loading
  const known = totalKm.value;
  useEffect(() => {
    if (!m || !t.size) return;
    const els: HTMLElement[] = [];
    const close = () => els.forEach((e) => { e.classList.remove("is-open"); e.setAttribute("aria-expanded", "false"); e.style.zIndex = ""; });
    type Pin = { el: HTMLElement; mk: ReturnType<typeof m.marker>; c: [number, number]; h: number; down: boolean; dx: number; far: boolean };
    const pins: Pin[] = [];
    for (const [id, owner] of t) {
      const spot = spotById(id);
      if (!spot) continue;
      const c = spotCoord(spot);
      const el = build(spot, owner, l, close);
      els.push(el);
      const mk = m.marker({ element: el, anchor: "bottom" }).setLngLat(c).addTo(m.map);
      pins.push({ el, mk, c: c as [number, number], h: el.classList.contains("spin--name") ? 40 : 86, down: false, dx: 0, far: false });
    }
    // and where the map's buttons are level with it, it leans left, its stem still on the spot
    const place = () => {
      const pad = m.viewPadding, box = m.map.getContainer().getBoundingClientRect();
      const ctl = document.querySelector(".controls")?.getBoundingClientRect();
      // with the whole island in view, a coin is half its size and sits right on its spot: it never hides a town's name
      const far = m.map.getZoom() < 7.6;
      for (const p of pins) {
        if (far !== p.far) { p.far = far; p.el.classList.toggle("spin--far", far); }
        const pt = m.map.project(p.c);
        // (the small coin of the far view sits on its spot: it never needs to hang below)
        const h = far && p.h > 40 ? 16 : p.h;
        const down = !(far && p.h > 40) && pt.y - h < pad.top && pt.y + p.h < box.height - pad.bottom;
        const x = box.left + pt.x, top = box.top + pt.y - (down ? 0 : h), half = far && p.h > 40 ? 16 : p.el.offsetWidth / 2;
        let dx = 0;
        if (ctl?.width && top < ctl.bottom && top + h > ctl.top && x + half > ctl.left - 6 && x - half < ctl.right) {
          dx = Math.round(Math.max(-(half - 10), ctl.left - 6 - (x + half)));
        }
        if (down === p.down && dx === p.dx) continue;
        p.down = down; p.dx = dx;
        p.el.classList.toggle("spin--down", down);
        p.el.style.setProperty("--sx", `${-dx}px`);
        p.mk.setOffset([dx, down ? p.h : 0]);
      }
    };
    place();
    m.map.on("move", place);
    m.map.on("resize", place);
    m.map.on("click", close);
    return () => { m.map.off("move", place); m.map.off("resize", place); m.map.off("click", close); pins.forEach((p) => p.mk.remove()); };
  }, [m, t, l, r, known]);
  return null;
}
