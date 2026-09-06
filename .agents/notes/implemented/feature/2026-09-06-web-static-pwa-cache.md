# Agent Note: Web static PWA cache

Status: implemented

English | [中文](2026-09-06-web-static-pwa-cache.zh.md)

## Problem

The Web application ships a manifest and icon but does not register a Service Worker, so browsers cannot retain static assets for a fast repeat load or offline fallback. The earlier single-purpose SW baked every caching decision into `sw.js`, leaving no room for the plugins the harness will ship later to ship their own offline behavior.

## Decision

`apps/web` registers `/sw.js` after page load only when the browser supports Service Workers and the page uses HTTPS, loopback, or RFC 1918 private LAN. The worker precaches the manifest and favicon, removes earlier `dsh-web-static-*` and `dsh-web-routes-*` caches at activation, and claims open pages. The worker persists its plugin-registered route table in a separate `dsh-web-routes-*` cache and rehydrates it on every activation, so the in-page route table is the source of truth at boot and survives SW restarts.

The SW exposes a small message protocol so plugins installed after the worker first activated can register fetch strategies without shipping a different worker:

- `register-route`: install or replace a `{ id, pattern, strategy, cacheName, maxEntries? }` entry. The `id` is plugin-owned and stable; a re-register with the same id replaces the previous entry, and `unregister-route` removes it.
- `unregister-route`: drop a previously-registered entry.
- `list-routes`: an inspection endpoint the page uses in development.
- `clear-cache`: drop one of the worker's caches from the settings UI.

The page-side API lives at `@deepseek-ai/dsh-client-web/pwa`: `registerServiceWorkerRoute(config)` returns a disposer, `unregisterServiceWorkerRoute(id)` removes one, `listServiceWorkerRoutes()` returns the in-memory table, and `clearServiceWorkerCache(name)` triggers a cache delete on the worker. The Web entry calls `registerPwa()` once during boot; the SW's `controllerchange` event causes every subsequent navigation to resend the in-memory route table, so a plugin that registers after activation still takes effect on the next page load.

Five strategies are supported, all single-response to keep the worker small: `cache-first`, `network-first`, `stale-while-revalidate`, `network-only`, and `cache-only`. Patterns are glob-like and stripped of origin; `*` matches a URL segment. Sensitive paths — the root page, `/login`, and `/api/` — never reach the worker: the SW ignores them so authentication, dynamic HTML, and Host API responses always use the network path. A refresh failure leaves a cached static response available when one exists.

At viewports narrower than 680px, the Web layout reserves no sidebar rail. Navigation and details render as dismissible overlay drawers, leaving the conversation at full viewport width until a user opens a panel.

The mobile conversation column overrides the desktop 680px reading-width floor with its available viewport width and removes transcript-width drag handles. Durable history records remain within the visible column instead of being clipped outside it.

The viewport requests `interactive-widget=resizes-content` so supported mobile browsers resize the content area when the virtual keyboard opens. The mobile composer uses at least a 16px editing font, preventing focus-driven page zoom in browsers that apply that behavior to smaller editable text.

## Verification

The built Web application test verifies that `sw.js` ships the precache entries, default static-route exclusions, plugin-extension message API, all five strategies, and keyboard viewport policy. The plugin-extension API test confirms the route primitives and `isSecurePwaContext` accept RFC 1918 LAN hostnames. Layout tests verify the zero-width mobile navigation track, drawer opening and dismissal, and zero-width details track. The TypeScript programs and production Vite build complete successfully.

## Alternatives considered

**Cache the root document and login page.** Their authentication state and HTML are dynamic, so a cached response could present stale access state.

**Cache API responses.** Host API results can contain current session and account data, and the Service Worker has no domain-specific freshness or authorization model for them.

**Register on every HTTP origin.** Service Workers require a secure context in normal deployments; allowing loopback and RFC 1918 origins covers the development surface without opening the worker to public-network attacks.

**Ship a plugin-bundled SW per plugin.** That would require coordinating scope, activation, and cache namespaces across files; the message protocol keeps a single SW file and concentrates complexity in one place.

## Consequences

Static assets load from the latest available cache while a background request refreshes them. LAN access over plain HTTP continues without Service Worker caching until the deployment uses HTTPS, loopback, or RFC 1918. Plugins can install offline behavior specific to their own routes without coordinating worker files, and the worker's persisted route table means a plugin update that registers a new route takes effect on the next navigation rather than the next worker update.