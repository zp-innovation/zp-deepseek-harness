# Agent Note: Web static PWA cache

Status: implemented

English | [中文](2026-09-06-web-static-pwa-cache.zh.md)

## Problem

The Web application ships a manifest and icon but does not register a Service Worker, so browsers cannot retain static assets for a fast repeat load or offline fallback.

## Decision

`apps/web` registers `/sw.js` after page load only when the browser supports Service Workers and the page uses HTTPS or `localhost`. The worker precaches the manifest and favicon, removes earlier `dsh-web-static-*` caches at activation, and claims open pages.

Same-origin GET requests use stale-while-revalidate caching. The worker never intercepts the root page, `/login`, or `/api/` requests, so authentication, dynamic HTML, and Host API responses always use the network path. A refresh failure leaves a cached static response available when one exists.

At viewports narrower than 680px, the Web layout reserves no sidebar rail. Navigation and details render as dismissible overlay drawers, leaving the conversation at full viewport width until a user opens a panel.

The mobile conversation column overrides the desktop 680px reading-width floor with its available viewport width and removes transcript-width drag handles. Durable history records remain within the visible column instead of being clipped outside it.

The viewport requests `interactive-widget=resizes-content` so supported mobile browsers resize the content area when the virtual keyboard opens. The mobile composer uses at least a 16px editing font, preventing focus-driven page zoom in browsers that apply that behavior to smaller editable text.

## Verification

The built Web application test verifies that `sw.js` ships with the precache entries, dynamic-route exclusions, stale-while-revalidate fallback, and keyboard viewport policy. Layout tests verify the zero-width mobile navigation track, drawer opening and dismissal, and zero-width details track. The TypeScript programs and production Vite build complete successfully.

## Alternatives considered

**Cache the root document and login page.** Their authentication state and HTML are dynamic, so a cached response could present stale access state.

**Cache API responses.** Host API results can contain current session and account data, and the Service Worker has no domain-specific freshness or authorization model for them.

**Register on every HTTP origin.** Service Workers require a secure context in normal deployments; allowing the local development origin is the browser-provided exception.

## Consequences

Static assets can load from the latest available cache while a background request refreshes them. LAN access over plain HTTP continues without Service Worker caching until the deployment uses HTTPS.
