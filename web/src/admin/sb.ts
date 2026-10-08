import { signal } from "@preact/signals";
import { createClient, type Session } from "@supabase/supabase-js";
import { FUNCTIONS_URL, SUPABASE_KEY, SUPABASE_URL } from "../config";
export { SUPABASE_KEY };

const STORAGE_KEY = "ta-admin-auth";
const ADMIN_FLAG = "ta-admin-ok"; // id of the last account confirmed as admin on this phone

/** Admin client: keeps the session on the phone so Ewan logs in once. */
export const sba = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY, detectSessionInUrl: false },
});

export const session = signal<Session | null>(null);
/** null = not decided yet, true/false = decided. Network trouble never turns true into false. */
export const isAdmin = signal<boolean | null>(null);

function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s?.refresh_token && s?.user ? (s as Session) : null;
  } catch (_) {
    return null;
  }
}
const cachedAdminId = () => { try { return localStorage.getItem(ADMIN_FLAG); } catch (_) { return null; } };
const setCachedAdmin = (id: string | null) => {
  try { if (id) localStorage.setItem(ADMIN_FLAG, id); else localStorage.removeItem(ADMIN_FLAG); } catch (_) { /* ignore */ }
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function confirmWithServer() {
  try {
    const { data } = await withTimeout(sba.auth.getSession(), 10_000);
    if (data.session) {
      session.value = data.session;
      await checkAdmin();
    } else if (!storedSession()) {
      // really signed out (not just offline)
      session.value = null;
      isAdmin.value = false;
    }
  } catch (_) {
    /* offline or slow network: keep what the phone already knows */
  }
}

export async function initAuth() {
  // 1. start instantly from the phone's own copy (works with no signal at all)
  const stored = storedSession();
  if (stored) {
    session.value = stored;
    if (cachedAdminId() === stored.user?.id) isAdmin.value = true;
  } else {
    isAdmin.value = false;
  }
  sba.auth.onAuthStateChange((event, s) => {
    if (s) session.value = s;
    if (event === "SIGNED_OUT") { session.value = null; isAdmin.value = false; setCachedAdmin(null); }
  });
  // 2. confirm in the background, and again whenever the network comes back
  confirmWithServer();
  window.addEventListener("online", () => confirmWithServer());
}

export async function checkAdmin() {
  const { data, error } = await sba.rpc("is_admin");
  if (error) {
    // network or server hiccup: never lock Ewan out because of a bad signal
    if (cachedAdminId() && cachedAdminId() === session.value?.user?.id) isAdmin.value = true;
    return;
  }
  isAdmin.value = !!data;
  setCachedAdmin(data ? session.value?.user?.id ?? null : null);
}

export async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const { data, error } = await sba.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return error.message.includes("Invalid login") ? "E-mail ou mot de passe incorrect." : error.message;
    session.value = data.session;
    await checkAdmin();
    if (isAdmin.value === null) isAdmin.value = false;
    return null;
  } catch (_) {
    return "Pas de connexion. La première connexion demande du réseau.";
  }
}

export async function setupAccount(code: string, email: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/admin-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, email, password }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const map: Record<string, string> = {
        bad_code: "Code incorrect.", weak_password: "Le mot de passe doit faire au moins 8 caractères.",
        bad_email: "Adresse e-mail invalide.", locked: "Trop d'essais. Demande un nouveau code.",
      };
      return map[j.error] ?? "La création du compte a échoué. Réessaie.";
    }
    return await signIn(email, password);
  } catch (_) {
    return "Pas de connexion. Réessaie quand tu as du réseau.";
  }
}

export async function signOut() {
  setCachedAdmin(null);
  await sba.auth.signOut().catch(() => {});
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
  session.value = null;
  isAdmin.value = false;
}
