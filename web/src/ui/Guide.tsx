// « Mon carnet de route »: the PDF of the 21 South Island stages I carry on my phone (scripts/guide/build.mjs), for
// anyone who wants to see what each stage holds. Written in French, as I wrote it for myself.
import { t } from "../i18n";
import { ChevronRight } from "./icons";

export const GUIDE_URL = `${import.meta.env.BASE_URL}guide/carnet-de-route.pdf`;

export function GuideRow({ block }: { block?: boolean }) {
  return (
    <div class={block ? "rows block" : "rows"}>
      <a class="row" href={GUIDE_URL} target="_blank" rel="noopener">
        <span class="row__thumb row__thumb--empty guide-thumb" aria-hidden="true">21</span>
        <span class="row__main">
          <span class="row__title">{t("guide")}</span>
          <span class="row__meta">{t("guideMeta")}</span>
        </span>
        <ChevronRight class="row__chev" />
      </a>
    </div>
  );
}
