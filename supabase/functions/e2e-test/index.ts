// e2e-test — one-shot backend integration test (creates a throwaway admin, exercises every
// write/read path the site uses, then removes everything). Protected by the import secret.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { adminClient, getSecret, json, safeEqual } from "../_shared/util.ts";

Deno.serve(async (req) => {
  const secret = await getSecret("import_secret");
  const given = req.headers.get("x-import-secret") ?? "";
  if (!secret || !safeEqual(given, secret)) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
  const admin = adminClient();
  const report: Record<string, unknown> = {};
  const step = (name: string, res: { error?: { message?: string } | null; data?: unknown; status?: number } | number) => {
    if (typeof res === "number") report[name] = res;
    else report[name] = res.error ? `ERROR: ${res.error.message}` : (res.data === null || res.data === undefined ? "ok" : res.data);
  };

  const email = `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) return json({ error: created.error.message }, 500);
  const userId = created.data.user.id;
  const dayId = crypto.randomUUID();
  const mediaId = crypto.randomUUID();
  const thumbPath = `d/${dayId}/${mediaId}_t.jpg`;
  const tusPath = `d/${dayId}/${mediaId}.mp4`;
  try {
    await admin.rpc("svc_add_admin", { p_user: userId });
    const user = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await user.auth.signInWithPassword({ email, password });
    step("sign_in", signed);
    report.sign_in = signed.error ? `ERROR: ${signed.error.message}` : "ok";
    const token = signed.data.session?.access_token ?? "";
    step("is_admin", await user.rpc("is_admin"));

    step("insert_day", await user.from("days").upsert({
      id: dayId, date: "2099-01-01", day_number: 999, kind: "hike", start_km: 0, end_km: 12.3,
      title: "E2E test", published: true, track: { p: [[0, 10], [12.3, 300]] },
    }, { onConflict: "id" }));

    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    step("upload_thumb", await user.storage.from("media").upload(thumbPath, new Blob([png], { type: "image/jpeg" }), { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" }));

    // resumable (TUS) upload, as used for videos
    const meta = (k: string, v: string) => `${k} ${btoa(v)}`;
    const create = await fetch(`${url}/storage/v1/upload/resumable`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`, apikey: anonKey, "x-upsert": "true", "Tus-Resumable": "1.0.0",
        "Upload-Length": String(png.length),
        "Upload-Metadata": [meta("bucketName", "media"), meta("objectName", tusPath), meta("contentType", "video/mp4"), meta("cacheControl", "31536000")].join(","),
      },
    });
    report.tus_create = create.status;
    const loc = create.headers.get("location");
    if (loc) {
      const patch = await fetch(loc, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, apikey: anonKey, "Tus-Resumable": "1.0.0", "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream" },
        body: png,
      });
      report.tus_patch = patch.status;
    }

    step("insert_media", await user.from("media").upsert({
      id: mediaId, day_id: dayId, kind: "photo", path: thumbPath, thumb_path: thumbPath, width: 1, height: 1, sort: 0, bytes: png.length,
    }, { onConflict: "id" }));
    step("set_cover", await user.from("days").update({ cover_media_id: mediaId }).eq("id", dayId));
    step("checkin", await user.from("positions").upsert([{ recorded_at: "2099-01-01T05:00:00Z", lat: -41.1, lng: 174.2, source: "checkin", note: "e2e" }], { onConflict: "source,recorded_at", ignoreDuplicates: true }));
    step("tracking_config_is_readable", { data: (await user.rpc("admin_tracking_config")).data ? "ok" : "missing" });
    step("storage_usage", await user.rpc("admin_storage_usage"));

    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    step("anon_read_day", await anon.from("days").select("id,title,cover_media_id").eq("id", dayId));
    step("anon_read_media", await anon.from("media").select("id,thumb_path").eq("day_id", dayId));
    report.anon_public_file = (await fetch(`${url}/storage/v1/object/public/media/${thumbPath}`)).status;
    report.anon_public_video = (await fetch(`${url}/storage/v1/object/public/media/${tusPath}`)).status;
    step("anon_post_message", await anon.rpc("post_message", { p_day: dayId, p_author: "Test", p_body: "Bonjour", p_device: crypto.randomUUID() }));
    step("anon_toggle_reaction", await anon.rpc("toggle_reaction", { p_day: dayId, p_emoji: "heart", p_device: crypto.randomUUID() }));
    step("anon_counts", await anon.rpc("get_message_counts"));
    const hack = await anon.storage.from("media").upload(`d/${dayId}/hack.jpg`, new Blob([png], { type: "image/jpeg" }));
    report.anon_upload_blocked = hack.error ? "blocked" : "NOT BLOCKED";
    const hack2 = await anon.from("days").insert({ date: "2099-01-02", day_number: 1 });
    report.anon_insert_blocked = hack2.error ? "blocked" : "NOT BLOCKED";
    const hack3 = await anon.rpc("admin_tracking_config");
    report.anon_secret_blocked = hack3.error ? "blocked" : "NOT BLOCKED";
    const hack4 = await anon.from("messages").select("ip_hash").limit(1);
    report.anon_ip_hidden = hack4.error ? "blocked" : "NOT BLOCKED";

    // cleanup through the admin's own permissions (same calls as the site)
    step("cleanup_files", await user.storage.from("media").remove([thumbPath, tusPath]));
    step("cleanup_day", await user.from("days").delete().eq("id", dayId));
  } catch (e) {
    report.exception = String((e as Error)?.message ?? e);
  } finally {
    await admin.from("positions").delete().eq("note", "e2e");
    await admin.from("days").delete().eq("id", dayId);
    await admin.storage.from("media").remove([thumbPath, tusPath]);
    await admin.auth.admin.deleteUser(userId);
  }
  report.left_days = (await admin.from("days").select("id", { count: "exact", head: true })).count;
  return json(report);
});
