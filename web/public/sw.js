// Service worker: instant reloads, an offline shell for the "Carnet" (Ewan's admin on the trail),
// and caching of map tiles & photos so repeat visits cost less bandwidth.
const SHELL = "shell-v2"; // the HTML pages (never trimmed: the Carnet must open with no signal)
const ASSETS = "assets-v1"; // hashed JS/CSS/fonts: safe to keep forever, trimmed by count
const TILES = "tiles-v1";
const MEDIA = "media-v1";
const DATA = "data-v1";
const KEEP = [SHELL, ASSETS, TILES, MEDIA, DATA];
const SCOPE = new URL("./", self.location.href).href;
const SHELL_FILES = ["./", "./index.html", "./admin/", "./admin/index.html", "./manifest.webmanifest", "./admin/manifest.webmanifest"];
const NAV_TIMEOUT_MS = 3500;
// This version's files (its code, styles and fonts), written in at build time (vite.config.js `precacheList`): they
// are all fetched when this worker installs, so the pages open with no signal even if they were never fully loaded
// with one. A new version of the site is a new worker, which fetches its own.
const BUILD = { id: "dev", files: [] };
const CURRENT = new Set(BUILD.files.map((f) => new URL(f, SCOPE).href));
// a file is found by its address alone: a page asks for its code with headers (Origin…) that the worker's own fetch
// at install didn't send, and a "Vary" on the reply would otherwise make the copy on the phone not count
const ANY = { ignoreVary: true };
// files of the site that keep their names when they change (the icons, the manifest, the link preview), unlike
// the hashed files in assets/
const UNHASHED = /\.(png|svg|webmanifest|jpg)$/;
const unhashed = (path) => UNHASHED.test(path) && !/\/assets\//.test(path);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    // the code first, then the pages that use it (fresh, not the browser's ten-minute copy): never a page whose
    // code isn't on the phone
    const assets = await caches.open(ASSETS);
    await Promise.all([...CURRENT].map(async (url) => {
      if (await assets.match(url, ANY)) return; // (a font that hasn't changed: already here)
      try { const res = await fetch(url, { cache: "reload" }); if (res.ok) await assets.put(url, res); } catch (_) { /* next time */ }
    }));
    const shell = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map(async (f) => {
      try { const res = await fetch(new Request(f, { cache: "reload" })); if (res.ok) await shell.put(new URL(f, SCOPE).href, res); } catch (_) { /* keep the old copy */ }
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // only this worker's own old caches (the Carnet keeps its own, e.g. the full trail for offline use)
    const mine = /^(shell|assets|tiles|media|data)-v\d+$/;
    await Promise.all(keys.filter((k) => mine.test(k) && !KEEP.includes(k)).map((k) => caches.delete(k)));
    // a new version of the site may bring new icons under the same names: they come fresh next time they are asked for
    const assets = await caches.open(ASSETS);
    for (const k of await assets.keys()) if (unhashed(new URL(k.url).pathname)) await assets.delete(k);
    await self.clients.claim();
  })());
});

/** Keep at most `max` entries, the oldest going first, but never this version's own files. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = (await cache.keys()).filter((k) => !CURRENT.has(k.url));
  const over = keys.length - max;
  for (let i = 0; i < over; i++) await cache.delete(keys[i]);
}

/** The code and styles a page asks for in its HTML (assets/…), as full addresses. */
function assetsOf(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)) out.add(new URL(m[1], base).href);
  return [...out];
}

/**
 * A fresh page from the network replaces the copy on the phone only once the code it asks for is on the phone too
 * (else, opened later with no signal, it would stay black).
 */
async function keepPage(cache, req, res) {
  try {
    const html = await res.clone().text();
    const assets = await caches.open(ASSETS);
    for (const url of assetsOf(html, req.url)) {
      if (await assets.match(url, ANY)) continue;
      const a = await fetch(url);
      if (!a.ok) return;
      await assets.put(url, a);
    }
    await cache.put(req, res);
  } catch (_) { /* no signal halfway: the old copy stays, with its code */ }
}

/**
 * Pages: fresh from the network when it answers quickly; otherwise (one bar of signal on the trail,
 * or none) the copy on the phone right away, and the network copy, if it ever arrives, is kept for next time.
 */
async function navigate(event) {
  const req = event.request;
  const cache = await caches.open(SHELL);
  const network = fetch(req);
  event.waitUntil(network.then((res) => (res.ok && res.type === "basic" ? keepPage(cache, req, res.clone()) : undefined), () => {}));
  const fallback = async () => {
    const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
    if (hit) return hit;
    const admin = new URL(req.url).pathname.includes("/admin");
    return cache.match(new URL(admin ? "admin/index.html" : "index.html", SCOPE).href, ANY);
  };
  let timer;
  const slow = new Promise((resolve) => { timer = setTimeout(resolve, NAV_TIMEOUT_MS, "slow"); });
  try {
    const first = await Promise.race([network, slow]);
    if (first !== "slow") return first;
    const hit = await fallback();
    return hit || (await network); // nothing on the phone yet: keep waiting for the network
  } catch (e) {
    const hit = await fallback();
    if (hit) return hit;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, ANY);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) {
    cache.put(req, res.clone()).then(() => max && trim(cacheName, max)).catch(() => {});
  }
  return res;
}

async function staleWhileRevalidate(event, cacheName, max) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => {
    if (res.ok && res.status === 200) cache.put(req, res.clone()).then(() => max && trim(cacheName, max)).catch(() => {});
    return res;
  });
  if (hit) {
    event.waitUntil(refresh.then(() => {}, () => {}));
    return hit;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);

  if (req.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(navigate(event));
    return;
  }
  if (url.origin === self.location.origin) {
    if (/\/data\/[^/]+\.json$/.test(url.pathname)) { event.respondWith(staleWhileRevalidate(event, DATA)); return; }
    if (unhashed(url.pathname)) event.respondWith(staleWhileRevalidate(event, ASSETS, 200)); // the copy on the phone now, a fresh one for next time
    else if (/\/assets\//.test(url.pathname) || /\.woff2$/.test(url.pathname)) event.respondWith(cacheFirst(req, ASSETS, 200));
    return;
  }
  if (/server\.arcgisonline\.com$/.test(url.host) || url.pathname.includes("/elevation-tiles-prod/") || url.host === "basemaps.linz.govt.nz") {
    // aerial imagery and relief don't change during a season: no need to download a tile twice
    event.respondWith(cacheFirst(req, TILES, 3000));
    return;
  }
  if (url.host === "tiles.openfreemap.org") {
    // the map's description changes with each weekly build; its tiles and fonts live at versioned addresses
    if (/\.(pbf|mvt)$/.test(url.pathname)) event.respondWith(cacheFirst(req, TILES, 3000));
    else event.respondWith(staleWhileRevalidate(event, DATA));
    return;
  }
  if (url.pathname.includes("/storage/v1/object/public/media/") && !/\.(mp4|mov|webm)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, MEDIA, 600));
    return;
  }
  if (url.pathname.endsWith("/storage/v1/object/public/site/trail.json")) {
    event.respondWith(staleWhileRevalidate(event, DATA));
  }
});
