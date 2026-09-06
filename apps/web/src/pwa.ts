/**
 * Thin re-export of the plugin-extensible Service Worker API so apps/web's
 * entry can keep importing it from a relative path. The actual registration
 * and route-management primitives live in `@deepseek-ai/dsh-client-web/pwa`
 * so future plugins can import them by package name.
 */
export {
  registerPwa,
  registerServiceWorkerRoute,
  unregisterServiceWorkerRoute,
  listServiceWorkerRoutes,
  clearServiceWorkerCache,
  isSecurePwaContext,
  type ServiceWorkerRouteConfig,
  type ServiceWorkerStrategy,
} from '@deepseek-ai/dsh-client-web'