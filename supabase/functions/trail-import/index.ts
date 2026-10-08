// trail-import — downloads the official Te Araroa GPS files (Te Araroa Trust, CC BY 4.0),
// stores raw tracks/points in PostGIS, then builds the South Island route (Ship Cove → Bluff)
// and publishes it as public JSON files in the "site" storage bucket.
//
// Auth: header `x-import-secret` (cron / maintenance) or an admin user's bearer token.
import { unzipSync } from "npm:fflate@0.8.2";
import { adminClient, cors, getSecret, isAdminRequest, json, safeEqual } from "../_shared/util.ts";

const DEFAULT_SOURCES = {
  tracks: "https://www.teararoa.org.nz/teararoatrail_2026_27/",
  km: "https://www.teararoa.org.nz/teararoatrail_askmpt_2026_27/",
};
const UA = "TeAraroaFollowSite/1.0 (personal hiking journal; contact via site owner)";

// ---------- tiny GPX parser (regex based, tolerant) ----------
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENT[e.toLowerCase()] ?? m;
    })
    .trim();
}
function tag(src: string, name: string): string | null {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(src);
  return m ? decode(m[1]) : null;
}
function attr(src: string, name: string): number | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(src);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

type Seg = { trk: number; seg: number; name: string | null; desc: string | null; type: string | null; c: number[][] };
type Pt = { name: string | null; desc: string | null; sym: string | null; type: string | null; lon: number; lat: number; ele: number | null };

function parsePoints(body: string, ptTag: string): number[][] {
  const out: number[][] = [];
  const re = new RegExp(`<${ptTag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${ptTag}>)`, "gi");
  let m: RegExpExecArray | null;
  let allEle = true;
  const tmp: Array<[number, number, number | null]> = [];
  while ((m = re.exec(body))) {
    const lat = attr(m[1], "lat");
    const lon = attr(m[1], "lon");
    if (lat === null || lon === null) continue;
    const eleS = m[2] ? tag(m[2], "ele") : null;
    const ele = eleS !== null ? parseFloat(eleS) : null;
    if (ele === null || !Number.isFinite(ele)) allEle = false;
    tmp.push([lon, lat, ele]);
  }
  for (const [lon, lat, ele] of tmp) {
    out.push(allEle && ele !== null ? [r6(lon), r6(lat), Math.round(ele * 10) / 10] : [r6(lon), r6(lat)]);
  }
  return out;
}

function parseGpx(xml: string): { segs: Seg[]; pts: Pt[] } {
  const segs: Seg[] = [];
  const pts: Pt[] = [];
  let trk = 0;
  for (const m of xml.matchAll(/<trk\b[^>]*>([\s\S]*?)<\/trk>/gi)) {
    const body = m[1];
    const head = body.split(/<trkseg\b/i)[0];
    const name = tag(head, "name"), desc = tag(head, "desc") ?? tag(head, "cmt"), type = tag(head, "type");
    let seg = 0;
    for (const s of body.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi)) {
      const c = parsePoints(s[1], "trkpt");
      if (c.length >= 2) segs.push({ trk, seg, name, desc, type, c });
      seg++;
    }
    trk++;
  }
  for (const m of xml.matchAll(/<rte\b[^>]*>([\s\S]*?)<\/rte>/gi)) {
    const body = m[1];
    const head = body.split(/<rtept\b/i)[0];
    const c = parsePoints(body, "rtept");
    if (c.length >= 2) {
      segs.push({ trk, seg: 0, name: tag(head, "name"), desc: tag(head, "desc"), type: tag(head, "type") ?? "route", c });
    }
    trk++;
  }
  for (const m of xml.matchAll(/<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/gi)) {
    const lat = attr(m[1], "lat"), lon = attr(m[1], "lon");
    if (lat === null || lon === null) continue;
    const b = m[2] ?? "";
    const eleS = tag(b, "ele");
    pts.push({
      name: tag(b, "name"), desc: tag(b, "desc") ?? tag(b, "cmt"), sym: tag(b, "sym"), type: tag(b, "type"),
      lon: r6(lon), lat: r6(lat), ele: eleS !== null && Number.isFinite(parseFloat(eleS)) ? parseFloat(eleS) : null,
    });
  }
  return { segs, pts };
}

// ---------- download helpers ----------
async function download(url: string): Promise<{ finalUrl: string; type: string; bytes: Uint8Array }> {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, Accept: "*/*" } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { finalUrl: res.url, type: res.headers.get("content-type") ?? "", bytes };
}

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

/** Returns { filename: text } of every GPX inside the download (follows one HTML hop if needed). */
async function fetchGpxFiles(url: string, log: string[]): Promise<Record<string, string>> {
  let d = await download(url);
  log.push(`${url} -> ${d.finalUrl} [${d.type}] ${d.bytes.length} B`);
  if (!isZip(d.bytes) && /html/i.test(d.type)) {
    const html = new TextDecoder().decode(d.bytes);
    const link = /href=["']([^"']+\.(?:zip|gpx))["']/i.exec(html)?.[1];
    if (!link) throw new Error(`No zip/gpx link found in ${d.finalUrl}`);
    const abs = new URL(link, d.finalUrl).toString();
    d = await download(abs);
    log.push(`  hop -> ${d.finalUrl} [${d.type}] ${d.bytes.length} B`);
  }
  const out: Record<string, string> = {};
  if (isZip(d.bytes)) {
    const files = unzipSync(d.bytes, { filter: (f) => /\.gpx$/i.test(f.name) && !f.name.startsWith("__MACOSX") });
    for (const [name, data] of Object.entries(files)) out[name] = new TextDecoder().decode(data);
  } else {
    out[d.finalUrl.split("/").pop() || "file.gpx"] = new TextDecoder().decode(d.bytes);
  }
  return out;
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = await getSecret("import_secret");
    const given = req.headers.get("x-import-secret") ?? "";
    const allowed = (secret && given && safeEqual(given, secret)) || (await isAdminRequest(req));
    if (!allowed) return json({ error: "unauthorized" }, 401);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action: string = body.action ?? "inspect";
    const sources = { ...DEFAULT_SOURCES, ...(body.sources ?? {}) };
    const log: string[] = [];
    const db = adminClient();

    if (action === "inspect") {
      const report: Record<string, unknown> = {};
      for (const [key, url] of Object.entries(sources)) {
        const files = await fetchGpxFiles(url as string, log);
        report[key] = Object.entries(files).map(([name, xml]) => {
          const { segs, pts } = parseGpx(xml);
          return {
            name, chars: xml.length, segments: segs.length, points: pts.length,
            vertices: segs.reduce((a, s) => a + s.c.length, 0),
            hasEle: segs.length ? segs[0].c[0].length === 3 : null,
            sampleSegNames: [...new Set(segs.map((s) => s.name))].slice(0, 12),
            samplePts: pts.slice(0, 5).map((p) => ({ name: p.name, desc: p.desc, sym: p.sym, type: p.type })),
            head: xml.slice(0, 600),
          };
        });
      }
      return json({ ok: true, log, report });
    }

    if (action === "ingest") {
      const run = crypto.randomUUID();
      const counts: Record<string, unknown> = {};
      for (const [key, url] of Object.entries(sources)) {
        const files = await fetchGpxFiles(url as string, log);
        for (const [name, xml] of Object.entries(files)) {
          const { segs, pts } = parseGpx(xml);
          const fileId = `${key}:${name}`;
          // chunk to keep request bodies small
          let batch: Seg[] = [];
          let n = 0;
          const flush = async () => {
            if (!batch.length) return;
            const { data, error } = await db.rpc("svc_trail_ingest", { p_run: run, p_file: fileId, p_tracks: batch, p_points: [] });
            if (error) throw error;
            counts[fileId] = data;
            batch = []; n = 0;
          };
          for (const s of segs) {
            batch.push(s); n += s.c.length;
            if (n > 15000) await flush();
          }
          await flush();
          for (let i = 0; i < pts.length; i += 4000) {
            const { data, error } = await db.rpc("svc_trail_ingest", {
              p_run: run, p_file: fileId, p_tracks: [], p_points: pts.slice(i, i + 4000),
            });
            if (error) throw error;
            counts[fileId] = data;
          }
        }
      }
      return json({ ok: true, run, log, counts });
    }

    if (action === "build") {
      const { data, error } = await db.rpc("svc_trail_build", { p_run: body.run ?? null });
      if (error) throw error;
      const out = data as { route: unknown; km: unknown; meta: Record<string, unknown> };
      const up = async (path: string, obj: unknown) => {
        const { error: e } = await db.storage.from("site").upload(path, new Blob([JSON.stringify(obj)], { type: "application/json" }), {
          upsert: true, contentType: "application/json", cacheControl: "300",
        });
        if (e) throw e;
      };
      await up("trail.json", out.route);
      if (out.km) await up("trail-km.json", out.km);
      return json({ ok: true, meta: out.meta });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
