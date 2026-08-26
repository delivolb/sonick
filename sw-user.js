/* ===================================================
   SONICK ORDERS VIEWER — Service Worker
   Deliberately minimal: its only job is to satisfy PWA
   installability (a registered SW + a manifest). It caches
   the static app shell for faster/offline loading of the UI
   chrome, and never touches Firebase/Firestore requests —
   those must always go straight to the network so the data
   stays live.
   =================================================== */

const CACHE_NAME = 'sonick-user-shell-v1';

// Static shell files only — no data, no Firebase SDK URLs.
const SHELL_FILES = [
  './user.html',
  './css/tokens.css',
  './css/layout.css',
  './css/components.css',
  './css/rtl.css',
  './css/user.css',
  './js/icons.js',
  './js/theme.js',
  './js/i18n.js',
  './js/countries.js',
  './js/phone.js',
  './js/user.js',
  './assets/logo-full.png',
  './assets/logo-full-ar.png',
  './assets/logo-mark.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever handle same-origin GET requests for the known shell files.
  // Everything else (Firebase Auth/Firestore, Google Fonts, CDN scripts,
  // any POST/PUT) is left completely untouched and goes straight to the
  // network as normal.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const path = new URL(req.url).pathname;
  const isShellFile = SHELL_FILES.some((f) => path.endsWith(f.replace('./', '/')));
  if (!isShellFile) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      // Stale-while-revalidate: serve cache instantly if we have it,
      // still refresh it in the background for next time.
      return cached || network;
    })
  );
});
