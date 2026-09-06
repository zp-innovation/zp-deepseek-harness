/**
 * Browser-safe, zero-dependency loopback classification shared by the `/api`
 * Host fence and the package's `ctx.connection` state. The predicate stays
 * package-internal; client plugins consume the derived state through Cordis.
 */

/**
 * Whether a hostname is a true loopback address (localhost, IPv6 loopback, or
 * any IPv4 address in 127/8).  Used by the API-level Host-header fence in
 * `isTrustedApiRequest`; private LAN IPs must be explicitly declared in
 * `trustedHosts` and are NOT accepted here.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Whether a hostname names the local loopback or a same-LAN private address.
 * Used by the client-side `isLoopback` flag to enable browser-based settings
 * persistence for devices on the same private network segment (10/8, 172.16-31/12,
 * 192.168/16).  The API-level Host fence uses `isLoopbackHostname` (strict)
 * and does NOT trust private IPs without an explicit `trustedHosts` entry.
 */
export function isPrivateLanHostname(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  if (!parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return false
  const [a, b] = [Number(parts[0]), Number(parts[1])]
  // 10/8 — RFC 1918 class A private
  if (a === 10) return true
  // 172.16-31/12 — RFC 1918 class B private
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168/16 — RFC 1918 class C private
  if (a === 192 && b === 168) return true
  return false
}
