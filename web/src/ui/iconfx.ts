// Every icon plays a little scene of its own when its control is used, as the navigation's do: an eye blinks,
// "play" nudges forward, a close cross turns away, a chevron steps the way it points, the search glass tilts,
// "locate" launches, the map unfolds, the orbit turns, a pencil scribbles (the scenes are in app.css, by
// `data-icon`). One listener for the whole page, like the tap sounds; with reduced motion the scenes don't play.
export function installIconFx(root: Document = document) {
  root.addEventListener("click", (e) => {
    const ctl = (e.target as Element | null)?.closest?.("button, a[href], [role=button], label");
    if (!ctl || ctl.closest(".lnav")) return; // (the navigation has its own scenes)
    const svg = ctl.querySelector<SVGSVGElement>("svg[data-icon]");
    if (!svg) return;
    svg.classList.remove("is-fx");
    void svg.getBoundingClientRect(); // (a fresh start, even on a second tap during the first scene)
    svg.classList.add("is-fx");
  }, true);
  root.addEventListener("animationend", (e) => {
    const el = e.target as Element;
    if (el instanceof SVGSVGElement && el.classList.contains("is-fx")) el.classList.remove("is-fx");
  }, true);
}
