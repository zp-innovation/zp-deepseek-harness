/**
 * Service Worker for the installable Web GUI.
 *
 * Two caching tiers:
 *
 * 1. Default static-asset cache (stale-while-revalidate): the manifest, favicon,
 *    and any other first-party GET the page loads. The same bypass rules from
 *    the original implementation are kept (root page, /login, /api/) so
 *    authentication, dynamic HTML, and Host API responses always use the
 *    network.
 *
 * 2. Plugin-registered routes: clients post `{op: "register-route", route}`
 *    messages to install custom strategies (cache-first, network-first, etc.)
 *    over a glob pattern. The route table is persisted in the `ROUTES_CACHE`
 *    metadata cache so it survives SW restarts. On every activation the SW
 *    reclaims the page and rehydrates the route table from that cache; the
 *    client also re-sends its in-memory routes on every navigation so plugins
 *    that registered after the SW last activated do not need to wait for an
 *    update to take effect.
 */

const SW_VERSION = 'v1'
const DEFAULT_CACHE = `dsh-web-static-${SW_VERSION}`
const ROUTES_CACHE = `dsh-web-routes-${SW_VERSION}`
const PRECACHE = ['/manifest.webmanifest', '/favicon.svg']
const ROUTES_RECORD = '/__routes__'

/** Wire message envelope exchanged between the page and the Service Worker. */
const MESSAGE = {
  REGISTER_ROUTE: 'register-route',
  UNREGISTER_ROUTE: 'unregister-route',
  LIST_ROUTES: 'list-routes',
  CLEAR_CACHE: 'clear-cache',
}

/** Caching strategies plugins may request. */
const STRATEGY = {
  'cache-first': 'cache-first',
  'network-first': 'network-first',
  'stale-while-revalidate': 'stale-while-revalidate',
  'network-only': 'network-only',
  'cache-only': 'cache-only',
}

/** @typedef {{ id: string, pattern: string, strategy: keyof typeof STRATEGY, cacheName: string, maxAgeMs?: number, maxEntries?: number }} RouteConfig */

/** @type {Map<string, RouteConfig>} */
let routes = new Map()

async function loadRoutes() {
  try {
    const cache = await caches.open(ROUTES_CACHE)
    const response = await cache.match(ROUTES_RECORD)
    if (response === undefined) return
    const data = await response.json()
    if (data === null || typeof data !== 'object') return
    routes = new Map(Object.entries(data))
  } catch {
    // Corrupted routes cache: start fresh; the client re-sends routes on next page load.
    routes = new Map()
  }
}

async function saveRoutes() {
  const cache = await caches.open(ROUTES_CACHE)
  const payload = JSON.stringify(Object.fromEntries(routes))
  await cache.put(ROUTES_RECORD, new Response(payload, {
    headers: { 'Content-Type': 'application/json' },
  }))
}

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + escaped.replace(/\*/g, '.*') + '$')
}

function findRoute(pathname) {
  for (const [id, route] of routes) {
    if (globToRegex(route.pattern).test(pathname)) return { id, route }
  }
  return null
}

async function pruneCache(cacheName, maxEntries) {
  if (maxEntries === undefined) return
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  const excess = keys.length - maxEntries
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i])
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const refresh = fetch(request).then((response) => {
    if (response.ok) void cache.put(request, response.clone())
    return response
  }).catch(() => undefined)
  return cached ?? (await refresh) ?? Response.error()
}

async function cacheFirst(request, cacheName, route) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached !== undefined) return cached
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    if (route !== undefined) await pruneCache(cacheName, route.maxEntries)
  }
  return response
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? Response.error()
  }
}

const STRATEGIES = {
  [STRATEGY['cache-first']]: cacheFirst,
  [STRATEGY['network-first']]: networkFirst,
  [STRATEGY['stale-while-revalidate']]: staleWhileRevalidate,
  [STRATEGY['network-only']]: (request) => fetch(request),
  [STRATEGY['cache-only']]: async (request, cacheName) => {
    const cache = await caches.open(cacheName)
    return (await cache.match(request)) ?? Response.error()
  },
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(DEFAULT_CACHE)
    .then((cache) => cache.addAll(PRECACHE))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then(async (keys) => {
      await Promise.all(keys
        .filter((key) => key.startsWith('dsh-web-static-') && key !== DEFAULT_CACHE && key !== ROUTES_CACHE)
        .map((key) => caches.delete(key)))
      await loadRoutes()
      await self.clients.claim()
    }))
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (data === null || typeof data !== 'object') return
  if (data.op === MESSAGE.REGISTER_ROUTE && data.route !== undefined) {
    routes.set(data.route.id, data.route)
    void saveRoutes()
  } else if (data.op === MESSAGE.UNREGISTER_ROUTE && typeof data.id === 'string') {
    routes.delete(data.id)
    void saveRoutes()
  } else if (data.op === MESSAGE.LIST_ROUTES) {
    event.source?.postMessage({ op: MESSAGE.LIST_ROUTES, routes: Object.fromEntries(routes) })
  } else if (data.op === MESSAGE.CLEAR_CACHE && typeof data.cacheName === 'string') {
    void caches.delete(data.cacheName)
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const matched = findRoute(url.pathname)
  if (matched !== null) {
    const strategy = STRATEGIES[matched.route.strategy]
    if (strategy !== undefined) {
      event.respondWith(strategy(request, matched.route.cacheName, matched.route, event))
      return
    }
  }

  // Default bypass: dynamic HTML, login, and Host API responses always use the network.
  if (url.pathname === '/' || url.pathname === '/login' || url.pathname.startsWith('/api/')) return

  event.respondWith(staleWhileRevalidate(request, DEFAULT_CACHE))
})