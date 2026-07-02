// Per-route slow-op threshold (ms) registry — the HTTP twin of the jobs plugin's
// `getJobSlowThresholdMs`. A route declares one via
// `defineEndpoint({ slowThresholdMs })`; `implement()` registers it at route-wiring
// time, and the slow-ops pipeline reads it (falling back to the global `httpMs`
// config) so a latency-sensitive endpoint can hold a tighter bar than the default.
const routeSlowThresholds = new Map<string, number>();

export function registerRouteSlowThreshold(route: string, ms: number): void {
  routeSlowThresholds.set(route, ms);
}

/** The per-route slow-op threshold (ms) declared via
 * `defineEndpoint({ slowThresholdMs })`, or `undefined` if none. */
export function getRouteSlowThresholdMs(route: string): number | undefined {
  return routeSlowThresholds.get(route);
}
