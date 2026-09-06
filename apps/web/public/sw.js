/* Static-resource cache for the installable Web GUI. */

const CACHE_NAME = 'dsh-web-static-v1'
const PRECACHE = ['/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(PRECACHE))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith('dsh-web-static-') && key !== CACHE_NAME)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()))
})

async function staticResponse(request, event) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  const refresh = fetch(request).then((response) => {
    if (response.ok) void cache.put(request, response.clone())
    return response
  })
  event.waitUntil(refresh.then(() => undefined, () => undefined))
  return cached ?? refresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname === '/' || url.pathname === '/login' || url.pathname.startsWith('/api/')) return

  event.respondWith(staticResponse(request, event))
})
