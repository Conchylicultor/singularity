// Minimal shape of the (still-experimental) Scheduler API we feature-detect on
// `globalThis.scheduler`. Typed narrowly so no `any` leaks.
interface SchedulerLike {
  /** Yields to the event loop, resolving in a fresh macrotask. */
  yield?: () => Promise<void>;
}

/**
 * Yields the event loop as a **macrotask** (unlike the microtask-only
 * `await Promise.resolve()`): a macrotask boundary admits queued request IO and
 * timers to run before we continue, so the between-files throttle is real under
 * a busy loop rather than cosmetic.
 *
 * DUPLICATED (intentionally, 3 lines) from
 * `infra/warmup/server/internal/yield-server.ts`. That copy is NOT exported from
 * `infra/warmup`'s barrel, so importing it here would either be a boundary
 * violation (reaching inside another plugin's barrel) or require editing
 * `infra/warmup`. The plan sanctions replicating this tiny helper. FOLLOW-UP:
 * promote `yieldServer` to a shared home (e.g. export it from `infra/warmup`'s
 * barrel or a `perfs/scheduler/server`) and de-duplicate both copies.
 */
export function yieldServer(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => setImmediate(resolve));
}
