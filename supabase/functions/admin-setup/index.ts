// admin-setup — creates (or resets the password of) the site admin account,
// protected by a one-time setup code stored in private.secrets.
// POST { code, email, password }
import { adminClient, cors, getSecret, json, safeEqual } from "../_shared/util.ts";

const MAX_FAILURES = 25;

function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").slice(0, 8).toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const db = adminClient();
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim().toUpperCase();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    const failures = parseInt((await getSecret("admin_setup_failures")) ?? "0", 10) || 0;
    if (failures >= MAX_FAILURES) return json({ error: "locked" }, 423);

    const expected = ((await getSecret("admin_setup_code")) ?? "").toUpperCase();
    if (!expected || !code || !safeEqual(code, expected)) {
      await db.rpc("svc_set_secret", { p_key: "admin_setup_failures", p_value: String(failures + 1) });
      return json({ error: "bad_code" }, 403);
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);
    if (password.length < 8) return json({ error: "weak_password" }, 400);

    // Find an existing user with this email (small project: one page is enough)
    let userId: string | null = null;
    for (let page = 1; page <= 5 && !userId; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (hit) userId = hit.id;
      if (data.users.length < 200) break;
    }

    if (userId) {
      const { error } = await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (error) throw error;
    } else {
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      userId = data.user.id;
    }

    const { error: e2 } = await db.rpc("svc_add_admin", { p_user: userId });
    if (e2) throw e2;

    // one-time code: rotate it and reset the failure counter
    await db.rpc("svc_set_secret", { p_key: "admin_setup_code", p_value: newCode() });
    await db.rpc("svc_set_secret", { p_key: "admin_setup_failures", p_value: "0" });

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error", detail: String((e as Error)?.message ?? e) }, 500);
  }
});
