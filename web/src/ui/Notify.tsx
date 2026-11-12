// "Être prévenu de chaque étape": the switch that signs this phone up for a notification each time I publish a day
// (src/lib/push.ts). Hidden until the server side is in place, and on browsers that can't; on an iPhone in Safari it
// says how to get there instead (the Home Screen first: Apple only allows it to web apps).
import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n";
import { disablePush, enablePush, pushReady, pushState, refreshPush } from "../lib/push";
import { Bell } from "./icons";
import { toast } from "./state";

export function NotifyCard({ block }: { block?: boolean }) {
  useEffect(() => { refreshPush(); }, []);
  /** the bell rings once when the visitor has just switched it on */
  const [ring, setRing] = useState(false);
  const st = pushState.value;
  if (pushReady.value !== true || st === "unknown" || st === "unsupported") return null;
  const on = st === "on";
  const busy = st === "busy";
  const flip = async (want: boolean) => {
    if (want) {
      const ok = await enablePush();
      setRing(ok);
      toast(ok ? t("notifyDone") : pushState.peek() === "denied" ? t("notifyDenied") : t("notifyError"), 3200);
    }
    else { await disablePush(); toast(t("notifyStopped")); }
  };
  const sub = st === "install" ? t("notifyInstall") : st === "denied" ? t("notifyDenied") : busy ? t("notifyBusy") : on ? t("notifyOn") : t("notifySub");
  return (
    <div class={`notify${block ? " block" : ""}`}>
      <div class="modes__list">
        {st === "install" || st === "denied" ? (
          <div class="switchrow notify__row">
            <span class="notify__icon" aria-hidden="true"><Bell /></span>
            <span class="switchrow__text">{t("notifyTitle")}<small>{sub}</small></span>
          </div>
        ) : (
          <label class={`switchrow notify__row${busy ? " is-busy" : ""}`}>
            <span class={`notify__icon${on ? " is-on" : ""}${on && ring ? " is-ringing" : ""}`} aria-hidden="true"><Bell /></span>
            <span class="switchrow__text">{t("notifyTitle")}<small aria-live="polite">{sub}</small></span>
            <input type="checkbox" role="switch" checked={on} disabled={busy} data-sfx="none"
              onChange={(e) => flip((e.target as HTMLInputElement).checked)} />
          </label>
        )}
      </div>
    </div>
  );
}
