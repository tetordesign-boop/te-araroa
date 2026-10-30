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
// files of the site that keep their names when they change (the icons, the manifest, the link preview), unlike
// the hashed files in assets/
const UNHASHED = /\.(png|svg|webmanifest|jpg)$/;
const unhashed = (path) => UNHASHED.test(path) && !/\/assets\//.test(path);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {}));
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

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/**
 * Pages: fresh from the network when it answers quickly; otherwise (one bar of signal on the trail,
 * or none) the copy on the phone right away, and the network copy, if it ever arrives, is kept for next time.
 */
async function navigate(event) {
  const req = event.request;
  const cache = await caches.open(SHELL);
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  event.waitUntil(network.then(() => {}, () => {}));
  const fallback = async () => {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const admin = new URL(req.url).pathname.includes("/admin");
    return cache.match(new URL(admin ? "admin/index.html" : "index.html", SCOPE).href);
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
  const hit = await cache.match(req);
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
