/** On an iPhone, the carnet must live on the home screen: its own storage (drafts are never wiped by Safari) and a full-screen app. */
export const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function InstallHint({ before }: { before?: boolean }) {
  if (isStandalone() || !isIos()) return null;
  return (
    <div class="hint" role="note">
      <strong>Ajoute le carnet à ton écran d'accueil</strong>
      <span>
        Touche <ShareGlyph /> Partager, puis « Sur l'écran d'accueil ». Ouvre-le ensuite depuis l'icône Carnet{before ? " et connecte-toi là" : ""} :
        c'est ce qui le fait marcher sans réseau et garde tes brouillons à l'abri.
      </span>
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg class="hint__glyph" viewBox="0 0 16 20" width="13" height="16" aria-hidden="true">
      <path d="M8 1v11M4.5 4.5 8 1l3.5 3.5M5 8H2.5v10.5h11V8H11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
