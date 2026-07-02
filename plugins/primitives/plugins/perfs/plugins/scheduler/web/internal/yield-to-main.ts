// Minimal shape of the (still-experimental) Scheduler API we feature-detect on
// `globalThis.scheduler`. Typed narrowly so no `any` leaks; both methods are
// optional because support varies (Chromium has both; Firefox/Safari neither).
interface SchedulerLike {
  /** Yields to the browser event loop, resolving in a fresh macrotask. */
  yield?: () => Promise<void>;
  /** Schedules a task at the given priority; we use it purely to yield. */
  postTask?: (
    callback: () => void,
    options?: { priority?: "user-blocking" | "user-visible" | "background" },
  ) => Promise<void>;
}

/**
 * Yield the main thread so browser-queued work — a `navigator.locks` grant (the
 * notifications socket), a paint, an input handler — can run before we continue
 * evaluating plugin chunks. Prefers the native scheduler primitives, falling
 * back to a `setTimeout(0)` macrotask so it works everywhere.
 *
 * Used to break the deferred plugin tier into batches with a breath between
 * them, so no single evaluation burst monopolizes the thread during boot.
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  if (scheduler?.postTask) {
    return scheduler.postTask(() => {}, { priority: "user-visible" });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
