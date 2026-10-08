import { useState } from "preact/hooks";
import { Marker } from "../ui/icons";
import { InstallHint } from "./InstallHint";
import { setupAccount, signIn } from "./sb";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(() => new URLSearchParams(location.hash.replace(/^#\??/, "")).get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = mode === "login" ? await signIn(email, password) : await setupAccount(code, email, password);
    setBusy(false);
    if (res) setErr(res);
  };

  return (
    <div class="auth">
      <form class="auth__box" onSubmit={submit}>
        <Marker class="auth__mark" />
        <h1>Carnet de route</h1>
        <p>{mode === "login" ? "Connecte-toi pour publier tes étapes depuis le sentier." : "Première fois ? Crée ton accès avec le code que Claude t'a donné."}</p>
        <InstallHint before />
        <div class="group">
          {mode === "setup" && (
            <label class="cell">
              <span>Code</span>
              <input value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} autoCapitalize="characters" autoComplete="one-time-code" placeholder="ABCD1234" required />
            </label>
          )}
          <label class="cell">
            <span>E-mail</span>
            <input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} autoComplete="username" placeholder="toi@exemple.com" required />
          </label>
          <label class="cell">
            <span>Mot de passe</span>
            <input type="password" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} placeholder="8 caractères min." required />
          </label>
        </div>
        {err && <p class="danger" style={{ marginTop: "-8px" }}>{err}</p>}
        <button class="bigbtn bigbtn--primary" type="submit" disabled={busy}>
          {busy ? "Un instant…" : mode === "login" ? "Se connecter" : "Créer mon accès"}
        </button>
        <button class="bigbtn bigbtn--secondary" type="button" onClick={() => { setMode(mode === "login" ? "setup" : "login"); setErr(null); }}>
          {mode === "login" ? "J'ai un code (première fois)" : "J'ai déjà un accès"}
        </button>
      </form>
    </div>
  );
}
