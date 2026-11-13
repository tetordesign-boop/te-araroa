// The three things switched on from the phone in Nov 2026 (questions, voice notes, notifications) need a script run
// once in the database and the "push" server function: until then the Carnet says so and keeps them out of the way
// (a day sent with a voice note to a database without the column would be refused).
import { signal } from "@preact/signals";
import { FUNCTIONS_URL, MOCK } from "../config";
import { sba } from "./sb";

export interface Features {
  /** the database script has been run (questions, the voice column, the phones' table) */
  db: boolean | null;
  /** the "push" server function answers ("jwt": it is there, but still asks for a sign-in: its "Verify JWT" is on) */
  push: boolean | "jwt" | null;
}
const KEY = "ta-admin-features-v1";
const read = (): Features => { try { return { db: null, push: null, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch (_) { return { db: null, push: null }; } };

// (with ?mock: switched on, or not with &nofeatures, to see the activation page)
const mockFeatures = (): Features => (new URLSearchParams(location.search).has("nofeatures") ? { db: false, push: false } : { db: true, push: true });
export const features = signal<Features>(MOCK ? mockFeatures() : read());
export const voiceReady = () => features.value.db === true;

const missing = (e: { code?: string; message?: string } | null) =>
  !!e && /does not exist|schema cache|42703|42P01|PGRST20[045]/i.test(`${e.code ?? ""} ${e.message ?? ""}`);

/** Looks again (on opening, and from the activation page); a network failure changes nothing. */
export async function checkFeatures(): Promise<Features> {
  if (MOCK) return features.value;
  const next = { ...features.value };
  try {
    const [v, q] = await Promise.all([
      sba.from("days").select("voice").limit(1),
      sba.from("questions").select("id").limit(1),
    ]);
    if (missing(v.error) || missing(q.error)) next.db = false;
    else if (!v.error && !q.error) next.db = true;
  } catch (_) { /* offline */ }
  try {
    const res = await fetch(`${FUNCTIONS_URL}/push`, { cache: "no-store" });
    if (res.ok) next.push = true;
    else if (res.status === 401) next.push = "jwt";
    else if (res.status === 404 || res.status >= 500) next.push = false;
  } catch (_) { /* offline */ }
  features.value = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) { /* ignore */ }
  return next;
}
