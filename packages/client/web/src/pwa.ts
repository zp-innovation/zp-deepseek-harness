/**
 * Plugin-extensible Service Worker registration. The Web shell registers the
 * worker on page load and exposes a small message-based API so plugins
 * installed after the SW first activated can register their own fetch
 * strategies without shipping a different worker. The SW persists its route
 * table across restarts; the page re-sends in-memory routes on every load so
 * plugins that registered late do not need to wait for an SW update.
 */

/** Caching strategies the Service Worker supports. */
export type ServiceWorkerStrategy =
  | 'cache-first'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'network-only'
  | 'cache-only'

/** A route entry the page installs in the Service Worker at runtime. */
export interface ServiceWorkerRouteConfig {
  /**
   * Stable plugin-owned id. Re-registering with the same id replaces the
   * previous entry; an `unregister` call without a re-register removes it.
   */
  readonly id: string
  /** Glob-like URL pattern (origin-stripped pathname). `*` matches a segment. */
  readonly pattern: string
  /** Strategy the SW applies on cache hit/miss for this route. */
  readonly strategy: ServiceWorkerStrategy
  /** Cache namespace; SW keys cache entries under `${cacheName}:${pathname}`. */
  readonly cacheName: string
  /** Optional upper bound on the number of entries kept in `cacheName`. */
  readonly maxEntries?: number
}

const MESSAGE_OP = {
  REGISTER_ROUTE: 'register-route',
  UNREGISTER_ROUTE: 'unregister-route',
  LIST_ROUTES: 'list-routes',
  CLEAR_CACHE: 'clear-cache',
} as const

const routes = new Map<string, ServiceWorkerRouteConfig>()
let swReady: Promise<ServiceWorker | null> | undefined

/**
 * Send a message to the active Service Worker, queueing requests so a
 * not-yet-ready controller does not drop registrations.
 */
function postMessage(message: Record<string, unknown>): Promise<void> {
  return ensureController().then((controller) => {
    if (controller === null) return
    controller.postMessage(message)
  })
}

function ensureController(): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  if (swReady !== undefined) return swReady
  swReady = navigator.serviceWorker.ready.then((reg) => {
    return reg.active ?? reg.installing ?? reg.waiting ?? null
  }).catch(() => null)
  return swReady
}

/**
 * Register one route. Idempotent per `id`; a re-registration replaces the
 * previous entry. Pages re-send their route set on every load, so plugin
 * installs that happen after the SW first activated take effect on the next
 * navigation without waiting for an SW update.
 * @param config - the route registration; see {@link ServiceWorkerRouteConfig}.
 * @returns a disposer that removes the registration when called.
 */
export function registerServiceWorkerRoute(config: ServiceWorkerRouteConfig): () => void {
  routes.set(config.id, config)
  void postMessage({ op: MESSAGE_OP.REGISTER_ROUTE, route: config })
  return () => unregisterServiceWorkerRoute(config.id)
}

/**
 * Remove a previously-registered route.
 * @param id - the registration id returned from the {@link registerServiceWorkerRoute} config.
 */
export function unregisterServiceWorkerRoute(id: string): void {
  routes.delete(id)
  void postMessage({ op: MESSAGE_OP.UNREGISTER_ROUTE, id })
}

/** Inspect the in-memory route table; intended for diagnostics and tests. */
export function listServiceWorkerRoutes(): readonly ServiceWorkerRouteConfig[] {
  return [...routes.values()]
}

/**
 * Ask the SW to delete one of its caches. Useful for a "Clear cache" UI.
 * @param cacheName - the cache namespace to drop.
 */
export function clearServiceWorkerCache(cacheName: string): Promise<void> {
  return postMessage({ op: MESSAGE_OP.CLEAR_CACHE, cacheName })
}

/**
 * Register the static-resource Service Worker. Called once from the Web entry
 * during boot; safe to call again from a HMR reset, as subsequent calls reuse
 * the cached registration promise and resend the in-memory route table.
 * @param scriptUrl - the URL of the Service Worker source; defaults to `/sw.js`.
 */
export function registerPwa(scriptUrl = '/sw.js'): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!isSecurePwaContext(location)) return

  const register = (): void => {
    void navigator.serviceWorker.register(scriptUrl, { scope: '/' }).then(() => {
      // After registration, the next controller change fires when the SW takes over.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        void resendAllRoutes()
      })
      void resendAllRoutes()
    }).catch((error: unknown) => {
      console.warn('web app: could not register the offline asset cache', error)
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

async function resendAllRoutes(): Promise<void> {
  if (routes.size === 0) return
  await ensureController()
  for (const route of routes.values()) {
    await postMessage({ op: MESSAGE_OP.REGISTER_ROUTE, route })
  }
}

/** Whether the current page is in a Secure Context that can host a Service Worker. */
export function isSecurePwaContext(target: { protocol: string, hostname: string }): boolean {
  if (target.protocol === 'https:') return true
  if (target.hostname === 'localhost' || target.hostname === '[::1]' || target.hostname === '127.0.0.1') return true
  // RFC 1918 private LAN: loopback-style exemption for development deployments.
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target.hostname)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(target.hostname)) return true
  const match = /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.exec(target.hostname)
  return match !== null
}