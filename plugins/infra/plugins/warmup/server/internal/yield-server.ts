// Minimal shape of the (still-experimental) Scheduler API we feature-detect on
// `globalThis.scheduler`. Typed narrowly so no `any` leaks.
interface SchedulerLike {
  /** Yields to the event loop, resolving in a fresh macrotask. */
  yield?: () => Promise<void>;
}

/**
 * Server twin of the browser `yieldToMain` (which lives in
 * `primitives/perfs/plugins/scheduler/web` and CANNOT be imported server-side —
 * that plugin is web-only). Yields the event loop as a **macrotask**, unlike the
 * microtask-only `await Promise.resolve()`: a macrotask boundary admits queued
 * request IO and timers to run before we continue, so the warm-up throttle is
 * real under a busy loop rather than cosmetic.
 *
 * Lives here (inside `infra/warmup`) rather than as a new `scheduler/server`
 * barrel to avoid scope creep — it has exactly one consumer today (the drain).
 */
export function yieldServer(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => setImmediate(resolve));
}
