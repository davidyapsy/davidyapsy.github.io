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
const CACHE_VERSION = "v13";
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
  "./js/dataSource.js",
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
      if (cached) {
        // Cache-first for instant loads (including the installed-app case).
        // Refresh the cache in the background for next time; a failure here
        // is fine to ignore since we've already got a valid response to give.
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }

      // Nothing cached yet (e.g. right after the phone's cache was cleared,
      // or a file that was never pre-cached): go to the network. IMPORTANT —
      // this must always resolve to a real Response, never `undefined`.
      // Returning `undefined` here makes event.respondWith() throw, which
      // Chrome reports to the user as a bare "ERR_FAILED" with no other
      // explanation — that was the bug. A synthetic offline Response instead
      // fails gracefully and is easy to recognize if it ever shows up.
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(
          () =>
            new Response(
              "Budget Pulse is offline and this file hasn't been cached yet. Reconnect and reload.",
              { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain" } }
            )
        );
    })
  );
});
