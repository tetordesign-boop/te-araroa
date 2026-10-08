// Service worker: instant reloads, offline shell for the admin "Carnet",
// and caching of map tiles & photos so repeat visits cost less bandwidth.
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const TILES = "tiles-v1";
const MEDIA = "media-v1";
const SHELL_FILES = ["./", "./index.html", "./admin/", "./admin/index.html", "./manifest.webmanifest", "./admin/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(new URL("./index.html", req.url).href));
    if (hit) return hit;
    throw e;
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

async function staleWhileRevalidate(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => {
    if (res.ok && res.status === 200) cache.put(req, res.clone()).then(() => max && trim(cacheName, max)).catch(() => {});
    return res;
  }).catch(() => hit);
  return hit || refresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);

  if (req.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, SHELL));
    return;
  }
  if (url.origin === self.location.origin) {
    if (/\/assets\//.test(url.pathname) || /\.(png|svg|webmanifest|woff2|jpg)$/.test(url.pathname)) event.respondWith(cacheFirst(req, SHELL, 120));
    return;
  }
  if (/server\.arcgisonline\.com$/.test(url.host) || url.pathname.includes("/elevation-tiles-prod/") || url.host === "basemaps.linz.govt.nz") {
    event.respondWith(staleWhileRevalidate(req, TILES, 1500));
    return;
  }
  if (url.pathname.includes("/storage/v1/object/public/media/") && !/\.mp4$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, MEDIA, 800));
    return;
  }
  if (url.pathname.endsWith("/storage/v1/object/public/site/trail.json")) {
    event.respondWith(staleWhileRevalidate(req, MEDIA));
  }
});
