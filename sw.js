/* ScanProf — mode hors-ligne.
 * Pages, scripts, styles : réseau d'abord (toujours la version à jour),
 * sinon la copie en cache (gymnase sans wifi).
 * Bibliothèque QR (lib/, ne change jamais) : cache d'abord.
 * Augmenter VERSION à chaque mise en ligne importante.
 */
const VERSION = "scanprof-v2-2026-10-31b";
const PREFIX = "scanprof-v2-";

const FILES = [
  "./",
  "index.html",
  "start.html",
  "scanner.html",
  "participants.html",
  "classes.html",
  "class.html",
  "activity.html",
  "applications.html",
  "groupe-zenos.html",
  "aide.html",
  "sauvegarde.html",
  "style.css",
  "scanprof-core.js",
  "theme.js",
  "app-store.js",
  "classes-store.js",
  "scanner.js",
  "participants.js",
  "classes-list.js",
  "class-detail.js",
  "activity-detail.js",
  "applications.js",
  "zenos.js",
  "backup.js",
  "lib/html5-qrcode.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // fichier par fichier : un fichier manquant ne bloque pas les autres
      Promise.all(FILES.map((f) => cache.add(new Request(f, { cache: "reload" })).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // on ne supprime que les anciens caches de ScanProf V2
        keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await Promise.race([fetch(request), timeout(4000)]);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const home = await cache.match("index.html");
    if (home && request.mode === "navigate") return home;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const update = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await update) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Uniquement les fichiers de ScanProf V2 (pas les autres applis du même domaine)
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return;

  const isLib = url.pathname.includes("/lib/");
  event.respondWith(isLib ? staleWhileRevalidate(request) : networkFirst(request));
});
