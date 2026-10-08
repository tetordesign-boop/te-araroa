// Shared helpers for the Te Araroa edge functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys);
      return parsed.default ?? Object.values(parsed)[0];
    } catch (_) { /* ignore */ }
  }
  throw new Error("No service key available");
}

let _admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await adminClient().rpc("svc_get_secret", { p_key: key });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** True when the request carries the bearer token of a site admin. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return false;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: row } = await admin.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return !!row;
}
