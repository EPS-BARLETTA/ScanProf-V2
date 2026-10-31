/* ScanProf — mode hors-ligne.
 * Pages, scripts, styles : réseau d'abord (toujours la version à jour),
 * sinon la copie en cache (gymnase sans wifi).
 * Bibliothèque QR (lib/, ne change jamais) : cache d'abord.
 * Augmenter VERSION à chaque mise en ligne importante.
 */
const VERSION = "scanprof-v2-2026-10-31c";
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

async function fromCache(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  if (request.mode === "navigate") return caches.match(new URL("index.html", self.registration.scope).href);
  return undefined;
}

const OFFLINE_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<body style="font-family:system-ui;text-align:center;padding:40px"><h1>📚 ScanProf</h1>' +
  '<p>Pas de connexion internet pour le moment.</p><p><button onclick="location.reload()" style="font-size:1.1rem;padding:12px 20px">Réessayer</button></p></body>';

// Réseau d'abord ; la copie locale n'est utilisée après 4 s que si elle existe.
// Sans copie, on attend le réseau : jamais de page d'erreur à cause d'un wifi lent.
async function networkFirst(request) {
  const network = fetch(request).then(async (response) => {
    if (response && response.ok && !response.redirected) {
      const cache = await caches.open(VERSION);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  });
  network.catch(() => {});
  const cached = await fromCache(request);
  try {
    if (!cached) return await network;
    return await Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(cached), 4000))]);
  } catch (err) {
    if (cached) return cached;
    if (request.mode === "navigate") return new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const update = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(VERSION);
        cache.put(request, response.clone()).catch(() => {});
      }
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
