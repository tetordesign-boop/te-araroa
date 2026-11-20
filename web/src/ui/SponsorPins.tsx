// The sponsors on the map: at each spot given to a brand, its logo turns in 3D like a coin, floating above the
// trail, its shadow narrowing as it turns edge-on. A tap opens a small card under it: the name, the place, the link
// to its site or Instagram, and the way to the trail's tickets. A spot given to someone without a logo (a friend's
// kilometre) is a small name tag instead. Spots with no place (the hardships, my gear) aren't on the map.
import { useEffect } from "preact/hooks";
import { lang } from "../i18n";
import { route } from "../lib/data";
import { cols, ends, linkLabel, logoSrc, parcelSpots, sections, spotById, spotCoord, taken, type Spot, type Taken } from "../lib/sponsors";
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
  const toggle = (e: Event) => {
    if ((e.target as HTMLElement).closest(".spin__link")) return; // the link opens by itself
    e.stopPropagation();
    if ((e.target as HTMLElement).closest(".spin__more")) { go({ name: "sponsors" }); return; }
    const open = !el.classList.contains("is-open");
    close();
    if (open) { el.classList.add("is-open"); el.setAttribute("aria-expanded", "true"); el.style.zIndex = "6"; }
  };
  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } if (e.key === "Escape") close(); });
  return el;
}

/** Keeps the map's sponsor pins in step with the given spots (rendered once, beside the map; draws nothing itself). */
export function SponsorPins() {
  const m = mapApi.value, t = taken.value, l = lang.value, r = route.value;
  // the spots are worked out from the trail's data, which may still be loading
  const known = cols.value.length + sections.value.length + parcelSpots.value.length + ends.value.length;
  useEffect(() => {
    if (!m || !t.size) return;
    const els: HTMLElement[] = [];
    const close = () => els.forEach((e) => { e.classList.remove("is-open"); e.setAttribute("aria-expanded", "false"); e.style.zIndex = ""; });
    const pins: { remove(): unknown }[] = [];
    for (const [id, owner] of t) {
      const spot = spotById(id);
      const c = spot && spotCoord(spot);
      if (!spot || !c) continue;
      const el = build(spot, owner, l, close);
      els.push(el);
      pins.push(m.marker({ element: el, anchor: "bottom" }).setLngLat(c).addTo(m.map));
    }
    m.map.on("click", close);
    return () => { m.map.off("click", close); pins.forEach((p) => p.remove()); };
  }, [m, t, l, r, known]);
  return null;
}
