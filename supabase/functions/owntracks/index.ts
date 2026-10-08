// owntracks — receives automatic position reports from the hiker's phone.
// Supports: OwnTracks (HTTP mode), Overland (iOS) and a simple JSON { lat, lon, tst?, acc?, note? }.
// Auth: HTTP Basic (any username, password = secret "owntracks_password") or ?key=<same secret>.
import { adminClient, cors, getSecret, json, safeEqual } from "../_shared/util.ts";

type Row = {
  recorded_at: string; lng: number; lat: number; alt?: number | null; acc?: number | null;
  speed?: number | null; batt?: number | null; source: string; note?: string | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const valid = (lat: number | null, lon: number | null) =>
  lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

function fromOwnTracks(m: Record<string, unknown>): Row | null {
  if (m._type !== "location") return null;
  const lat = num(m.lat), lon = num(m.lon);
  if (!valid(lat, lon)) return null;
  const tst = num(m.tst);
  return {
    recorded_at: new Date(tst ? tst * 1000 : Date.now()).toISOString(),
    lat: lat!, lng: lon!, alt: num(m.alt), acc: num(m.acc),
    speed: num(m.vel), batt: num(m.batt), source: "owntracks",
  };
}

function fromOverland(f: Record<string, any>): Row | null {
  const c = f?.geometry?.coordinates;
  if (!Array.isArray(c)) return null;
  const lon = num(c[0]), lat = num(c[1]);
  if (!valid(lat, lon)) return null;
  const p = f.properties ?? {};
  const t = p.timestamp ? Date.parse(p.timestamp) : Date.now();
  return {
    recorded_at: new Date(Number.isFinite(t) ? t : Date.now()).toISOString(),
    lat: lat!, lng: lon!, alt: num(p.altitude), acc: num(p.horizontal_accuracy),
    speed: num(p.speed) !== null ? num(p.speed)! * 3.6 : null,
    batt: num(p.battery_level) !== null ? Math.round(num(p.battery_level)! * 100) : null,
    source: "owntracks",
  };
}

function fromSimple(m: Record<string, unknown>): Row | null {
  const lat = num(m.lat ?? m.latitude), lon = num(m.lon ?? m.lng ?? m.longitude);
  if (!valid(lat, lon)) return null;
  const tst = num(m.tst);
  return {
    recorded_at: new Date(tst ? tst * 1000 : Date.now()).toISOString(),
    lat: lat!, lng: lon!, acc: num(m.acc), alt: num(m.alt), source: "owntracks",
    note: typeof m.note === "string" ? m.note.slice(0, 280) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = (await getSecret("owntracks_password")) ?? "";
    const url = new URL(req.url);
    let given = url.searchParams.get("key") ?? "";
    const auth = req.headers.get("authorization") ?? "";
    if (!given && /^Basic\s+/i.test(auth)) {
      try {
        const decoded = atob(auth.replace(/^Basic\s+/i, ""));
        given = decoded.slice(decoded.indexOf(":") + 1);
      } catch (_) { /* ignore */ }
    }
    if (!secret || !given || !safeEqual(given, secret)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json", "WWW-Authenticate": 'Basic realm="te-araroa"' },
      });
    }
    if (req.method !== "POST") return json({ ok: true, hint: "POST positions here" });

    const body = await req.json().catch(() => null);
    const rows: Row[] = [];
    const push = (r: Row | null) => r && rows.push(r);
    if (Array.isArray(body)) body.forEach((m) => push(fromOwnTracks(m) ?? fromSimple(m)));
    else if (body && Array.isArray(body.locations)) body.locations.forEach((f: any) => push(fromOverland(f)));
    else if (body && body._type) push(fromOwnTracks(body));
    else if (body) push(fromSimple(body));

    if (rows.length) {
      const { error } = await adminClient().from("positions")
        .upsert(rows, { onConflict: "source,recorded_at", ignoreDuplicates: true });
      if (error) throw error;
    }
    // OwnTracks expects a JSON array; Overland expects {"result":"ok"}
    if (body && Array.isArray(body.locations)) return json({ result: "ok", saved: rows.length });
    return json([]);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
