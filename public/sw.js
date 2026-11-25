// The build replaces VERSION and PRECACHE (see vite/sw-plugin.ts).
const VERSION = 'dev';
const PRECACHE = [];
const PREFIX = 'office-image-peek-';
const CACHE = PREFIX + VERSION;

self.addEventListener('install', (event) => {
  const urls = PRECACHE.map(
    (path) => new URL(path, self.registration.scope).href,
  );
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(urls))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(PREFIX) && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (
    request.method !== 'GET' ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }
  event.respondWith(
    caches
      .match(request, { ignoreSearch: true })
      .then((hit) => hit || fetch(request)),
  );
});
