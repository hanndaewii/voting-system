/**
 * JUDGED VOTE — service worker (app shell cache)
 *
 * Strategy:
 *  - Navigation requests: network-first, fall back to the cached shell so the
 *    app still opens offline.
 *  - Static shell assets: cache-first (with background fill).
 *  - Anything that looks like an API call (POST, /api path, ?action= query)
 *    always goes to the network — scores must never be served stale.
 */
const CACHE = 'jv-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url, request) {
  if (request.method !== 'GET') return true;              // POST saves always hit network
  if (url.pathname.endsWith('/api')) return true;         // mock/real API path
  if (url.searchParams.has('action')) return true;        // Apps Script style ?action=
  if (url.pathname.indexOf('/exec') !== -1) return true;  // Apps Script /exec
  return false;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== location.origin) return;
  if (isApiRequest(url, request)) return; // never touch the API with cache logic

  if (request.mode === 'navigate') {
    // Network-first for page loads; offline → cached shell.
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for shell assets.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
