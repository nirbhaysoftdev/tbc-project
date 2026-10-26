/* eslint-disable no-restricted-globals */
// public/sw.js
//
// The service worker. It exists for two reasons and deliberately does very
// little beyond them:
//
//   1. A browser will not offer "Install" for a site that has no service
//      worker with a fetch handler. This file is what makes the portal
//      installable on Android and on desktop Chrome/Edge at all.
//   2. The shell keeps working on a bad connection, and a failed navigation
//      shows the portal's own offline page instead of the browser's dinosaur.
//
// WHAT IT MUST NEVER DO IS CACHE A MEMBER'S DATA. In production the API is
// same-origin (`/api` is proxied by nginx), so a naive "cache every GET"
// worker would write one member's wallet, documents and messages into a cache
// that the next member on that device could read back. `/api` and `/uploads`
// are therefore skipped entirely - not cached, not even inspected - and the
// request goes to the network as if this file did not exist. Everything that
// IS cached is a public build artefact: HTML shells with no data in them,
// hashed JS/CSS, icons and images.
//
// STALENESS IS THE OTHER TRAP. The portal is a static export behind nginx and
// is redeployed often, so navigations are network-first: online, you always
// get the build that is on the server. Only `/_next/static` is served
// cache-first, and it is safe because those filenames contain a content hash -
// a new build is a new URL. Bump VERSION when this file changes and the old
// caches are dropped on activate.

const VERSION = 'v2';
const SHELL_CACHE = `tbc-shell-${VERSION}`;
const ASSET_CACHE = `tbc-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

/** Paths that must never touch the cache: they are a member's own data. */
const PRIVATE_PREFIXES = ['/api/', '/uploads/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png']))
      // A failed precache must not leave the worker uninstalled forever; the
      // offline page is a nicety, installability is not.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// The page asks for the new worker to take over when the member accepts an
// update, rather than the worker deciding to swap under their feet mid-form.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const isPrivate = (url) => PRIVATE_PREFIXES.some((p) => url.pathname.startsWith(p));
// Content-hashed build output: a new build is a new URL, so it can be served
// from the cache forever. `next dev` output is NOT hashed and is excluded -
// see registerServiceWorker(), which does not register this worker in
// development at all. Both guards, because one of them failing silently means
// stale JavaScript that looks like a code bug.
const isImmutable = (url) =>
  url.pathname.startsWith('/_next/static/')
  && !url.pathname.startsWith('/_next/static/development/')
  && !url.pathname.includes('.hot-update.');
const isAsset = (url) =>
  url.pathname.startsWith('/icons/')
  || url.pathname.startsWith('/images/')
  || /\.(?:png|jpe?g|webp|svg|gif|ico|woff2?)$/i.test(url.pathname);

/** Network first, falling back to whatever copy we have. Used for pages. */
async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallback) {
      const offline = await cache.match(fallback);
      if (offline) return offline;
    }
    throw err;
  }
}

/** Cache first, for files whose URL changes when their contents do. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only plain GETs of our own origin are ours to answer. A POST, a range
  // request, the API, an upload or a third-party font goes straight through.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, OFFLINE_URL));
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        // Stale-while-revalidate: an icon or a marketing image can be a build
        // behind for one load, and the refresh happens in the background.
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic') {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE));
});
