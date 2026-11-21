// "Mes alertes": a notification on this phone when someone asks for a ticket, leaves me a note, asks a question, or
// signs up for the site's notifications, each kind on or off; a tap opens the Carnet on that page (admin/alerts.ts).
import { useEffect } from "preact/hooks";
import { ALERT_KINDS, alertKinds, alertState, disableAlerts, enableAlerts, refreshAlerts, sendTest, setAlertKinds, type AlertKind } from "./alerts";
import { say } from "./nav";
import { Bar } from "./Pages";

/** the line on the Carnet's home */
export function alertsLine(): string {
  const st = alertState.value;
  if (st === "on") {
    const n = alertKinds.value.length;
    return n ? `Sur ce téléphone : ${ALERT_KINDS.filter((k) => alertKinds.value.includes(k.kind)).map((k) => k.label.toLowerCase()).join(", ")}` : "Activées, mais aucun sujet choisi";
  }
  if (st === "install") return "Ajoute d'abord le Carnet à l'écran d'accueil";
  if (st === "denied") return "Bloquées dans les réglages de l'iPhone";
  return "Tickets, coups de pouce, mots, questions : à activer";
}

function Note({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <div class="group">
      <div class="cell"><span class="cell__main"><span class="cell__title">{title}</span><span class="cell__meta">{children}</span></span></div>
    </div>
  );
}

export function AlertsPage() {
  useEffect(() => { void refreshAlerts(); }, []);
  const st = alertState.value, kinds = alertKinds.value;

  const toggle = async (on: boolean) => {
    if (on) {
      const err = await enableAlerts();
      if (err) say(err, 3200);
      else if (alertState.peek() === "on") say("C'est activé : une notification de test arrive.", 3200);
    } else {
      await disableAlerts();
      say("Alertes coupées sur ce téléphone.");
    }
  };
  const flip = async (k: AlertKind, on: boolean) => {
    const next = on ? [...new Set([...kinds, k])] : kinds.filter((x) => x !== k);
    if (!(await setAlertKinds(next))) say("Pas enregistré : vérifie le réseau et réessaie.");
  };

  return (
    <div class="adm">
      <Bar title="Mes alertes" />
      <p class="adm-sub" style={{ marginTop: "12px" }}>Une notification sur ce téléphone quand quelqu'un achète ou demande un ticket, te donne un coup de pouce, te laisse un mot ou te pose une question. La toucher ouvre la bonne page du Carnet.</p>

      {st === "install" && (
        <Note title="D'abord sur l'écran d'accueil">
          Sur iPhone, Apple n'envoie de notifications qu'aux applis web ouvertes depuis l'écran d'accueil. Dans Safari, touche Partager, puis « Sur l'écran d'accueil » ; ouvre ensuite le Carnet depuis son icône et reviens ici.
        </Note>
      )}
      {st === "unsupported" && <Note title="Pas sur ce navigateur">Ce navigateur ne reçoit pas de notifications. Ouvre le Carnet sur ton iPhone, depuis l'écran d'accueil.</Note>}
      {st === "denied" && <Note title="Notifications refusées">Elles sont bloquées pour le Carnet. Sur iPhone : Réglages, Notifications, Carnet, puis « Autoriser les notifications ». Reviens ensuite ici.</Note>}
      {st === "missing" && <Note title="Pas encore installé">Les alertes ne sont pas encore dans la base : demande à Claude de les activer.</Note>}

      {(st === "off" || st === "on" || st === "busy" || st === "unknown") && (
        <>
          <div class="group" style={{ marginTop: "18px" }}>
            <label class="switchrow">
              <span class="switchrow__text">Me prévenir sur ce téléphone<small>{st === "on" ? "Activé : tu reçois les alertes choisies ci-dessous." : st === "busy" ? "Un instant…" : "Désactivé."}</small></span>
              <input type="checkbox" role="switch" checked={st === "on"} disabled={st === "busy" || st === "unknown"} onChange={(e) => toggle((e.target as HTMLInputElement).checked)} />
            </label>
          </div>
          {st === "on" && (
            <>
              <div class="group__title">Me prévenir pour</div>
              <div class="group">
                {ALERT_KINDS.map((k) => (
                  <label class="switchrow" key={k.kind}>
                    <span class="switchrow__text">{k.label}<small>{k.meta}</small></span>
                    <input type="checkbox" role="switch" checked={kinds.includes(k.kind)} onChange={(e) => flip(k.kind, (e.target as HTMLInputElement).checked)} />
                  </label>
                ))}
              </div>
              <div class="group">
                <button class="cell" type="button" onClick={async () => say((await sendTest()) ? "Envoyée : elle arrive dans quelques secondes." : "Pas réussi : vérifie le réseau et réessaie.", 3200)}>
                  <span class="cell__main"><span class="cell__title">M'envoyer une alerte de test</span></span>
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
