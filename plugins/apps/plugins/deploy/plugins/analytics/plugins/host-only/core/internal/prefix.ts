/**
 * The path prefix of every route that must be reachable ONLY from the deployed
 * box itself (an SSH session curling the install's loopback port), never from
 * the public internet.
 *
 * Two independent guards key on it:
 * - the generated Caddy site block answers `respond /api/host-only/* 404`
 *   before `reverse_proxy`, so a public request never reaches the gateway;
 * - `hostOnly(handler)` (server barrel) 404s any request that crossed more
 *   than the gateway's own proxy hop, and throws if it wraps a route outside
 *   this prefix (which would silently lose the Caddy guard).
 *
 * Trailing slash included: `${HOST_ONLY_PREFIX}analytics/query`.
 */
export const HOST_ONLY_PREFIX = "/api/host-only/";
