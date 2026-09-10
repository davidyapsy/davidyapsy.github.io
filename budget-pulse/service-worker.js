// Budget Pulse — service worker.
//
// Its only job is making the app *installable* and letting the shell (HTML/
// CSS/JS/icons) open instantly, including offline. It never touches your
// data: any request that isn't for one of this app's own files — most
// importantly every call to sheets.googleapis.com or Google's sign-in —
// is left completely alone and goes straight to the network.
//
// Bump CACHE_VERSION whenever you change any cached file (css/js/html) so
// returning visitors — including anyone who's installed this on their phone
// — pick up the update instead of an old cached copy.
const CACHE_VERSION = "v3";
const CACHE_NAME = `budget-pulse-${CACHE_VERSION}`;

// Everything the app shell needs to render, relative to this file's own
// scope — works whether this is hosted at a domain root or a subpath
// (e.g. davidyapsy.github.io/budget-pulse/).
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/config.js",
  "./js/demoData.js",
  "./js/auth.js",
  "./js/sheetsApi.js",
  "./js/dashboard.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only ever handle same-origin GET requests for this app's own files.
  // Everything else (Google Sheets API, Google sign-in, any cross-origin
  // call) is left untouched — no respondWith, no interception at all.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // offline: fall back to whatever's cached

      // Cache-first for instant loads (including the installed-app case);
      // the network call above still refreshes the cache for next time.
      return cached || network;
    })
  );
});
