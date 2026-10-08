import { signal } from "@preact/signals";
import { createClient, type Session } from "@supabase/supabase-js";
import { FUNCTIONS_URL, SUPABASE_KEY, SUPABASE_URL } from "../config";
export { SUPABASE_KEY };

/** Admin client: keeps the session on the phone so Ewan logs in once. */
export const sba = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "ta-admin-auth", detectSessionInUrl: false },
});

export const session = signal<Session | null>(null);
export const isAdmin = signal<boolean | null>(null);

export async function initAuth() {
  const { data } = await sba.auth.getSession();
  session.value = data.session;
  sba.auth.onAuthStateChange((_e, s) => { session.value = s; if (!s) isAdmin.value = false; });
  if (data.session) await checkAdmin();
  else isAdmin.value = false;
}

export async function checkAdmin() {
  const { data, error } = await sba.rpc("is_admin");
  if (error) {
    // offline: trust the cached session so drafts can still be written
    if (!navigator.onLine && session.value) { isAdmin.value = true; return; }
    isAdmin.value = false;
    return;
  }
  isAdmin.value = !!data;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await sba.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) return error.message.includes("Invalid login") ? "E-mail ou mot de passe incorrect." : error.message;
  await checkAdmin();
  return null;
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
  await sba.auth.signOut();
  isAdmin.value = false;
}
