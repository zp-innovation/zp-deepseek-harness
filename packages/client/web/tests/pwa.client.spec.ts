/**
 * Pure-host tests for the Service Worker route table. The browser-side
 * navigation/messaging pieces are exercised by `apps/web`'s built-web tests,
 * which can inspect the real worker and the built JS; here we just assert
 * the message-protocol shape and the strategy enum.
 */

import { describe, expect, it } from 'vitest'
import {
  isSecurePwaContext,
  type ServiceWorkerRouteConfig,
  type ServiceWorkerStrategy,
} from '../src/pwa.ts'

const STRATEGIES: readonly ServiceWorkerStrategy[] = [
  'cache-first',
  'network-first',
  'stale-while-revalidate',
  'network-only',
  'cache-only',
]

describe('Service Worker route API contract', () => {
  it('exposes the five caching strategies plugins can request', () => {
    expect(STRATEGIES).toHaveLength(5)
    for (const strategy of STRATEGIES) {
      const route: ServiceWorkerRouteConfig = {
        id: `probe-${strategy}`,
        pattern: '/probe/*',
        strategy,
        cacheName: 'probe-cache',
      }
      // The shape must round-trip through JSON the way the SW stores it.
      expect(JSON.parse(JSON.stringify(route))).toEqual(route)
    }
  })

  it('rejects non-secure origins other than loopback and RFC 1918 private LAN', () => {
    expect(isSecurePwaContext({ protocol: 'http:', hostname: 'evil.example' })).toBe(false)
    expect(isSecurePwaContext({ protocol: 'https:', hostname: 'app.example' })).toBe(true)
    expect(isSecurePwaContext({ protocol: 'http:', hostname: 'localhost' })).toBe(true)
    expect(isSecurePwaContext({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(true)
    expect(isSecurePwaContext({ protocol: 'http:', hostname: '10.0.0.7' })).toBe(true)
    expect(isSecurePwaContext({ protocol: 'http:', hostname: '172.20.4.5' })).toBe(true)
    expect(isSecurePwaContext({ protocol: 'http:', hostname: '192.168.10.121' })).toBe(true)
    // Outside private ranges or not loopback: refused.
    expect(isSecurePwaContext({ protocol: 'http:', hostname: '172.32.0.1' })).toBe(false)
    expect(isSecurePwaContext({ protocol: 'http:', hostname: '8.8.8.8' })).toBe(false)
  })
})