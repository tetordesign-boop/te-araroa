// A day's own words and figures, with no state of the site: shared by the site (ui/Home.tsx, ui/DayView.tsx) and the
// Carnet's preview (admin/Preview.tsx).
import { t } from "../i18n";
import type { Day, Lang } from "../types";
import { typo } from "./format";

/** Ewan's title, else where the day went ("St Arnaud → Upper Travers Hut"), else where it ended. */
export function dayTitle(d: Day, l: Lang): string {
  const t = l === "en" && d.title_en ? d.title_en : d.title;
  if (t) return t;
  if (d.start_name && d.end_name && d.start_name !== d.end_name) return `${d.start_name} → ${d.end_name}`;
  return d.end_name ?? d.start_name ?? "";
}

/** The title as shown: never empty. */
export function titleOf(d: Day, l: Lang): string {
  return typo(dayTitle(d, l) || (d.kind === "rest" ? t("rest") : t("noTitle", { n: d.day_number })));
}

/** The day's km: as entered, else along the trail. */
export const dayKm = (d: Day) => d.distance_km ?? (d.start_km !== null && d.end_km !== null ? d.end_km - d.start_km : null);
