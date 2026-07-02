export interface Inflight {
  /**
   * Run `fn` under `key`, sharing one in-flight promise across concurrent
   * callers with the same key. The first caller starts `fn`; callers that arrive
   * while it is unsettled receive the *same* promise (and so the same resolved
   * value or rejection). The entry is cleared the moment the promise settles, so
   * the next call after settlement runs `fn` fresh.
   *
   * This is a *concurrency* deduplicator, NOT a cache: it only collapses work
   * that overlaps in time. Pair it with a TTL cache if you also want to reuse a
   * settled result. Because the shared body runs once, never use it to dedupe
   * operations whose callers each need a distinct side effect (e.g. mutations).
   *
   * `onWait`, if given, is called once with the milliseconds spent awaiting an
   * EXISTING in-flight promise — only joiners report; the starter (whose time
   * is `fn`'s own execution, not queue-wait) never calls it. It fires when the
   * shared flight settles (`finally`-based, so a rejecting flight still
   * reports), in the joiner's own async context so callers can make the
   * coalescing observable — e.g. charge a profiler wait — without coupling
   * this primitive to a profiler. Mirrors the semaphore's `onWait` shape.
   */
  run<T>(key: string, fn: () => Promise<T>, onWait?: (waitMs: number) => void): Promise<T>;
  /** Number of distinct keys currently in flight (introspection / tests). */
  readonly size: number;
}

/**
 * In-flight request deduplicator: a `Map<key, pending promise>`, nothing more.
 * Use it to stop a burst of identical concurrent reads (same loader fired from N
 * tabs, the same git/subprocess batch requested by two callers at once) from
 * doing the work N times — they share one execution and one result.
 */
export function createInflight(): Inflight {
  const pending = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, fn: () => Promise<T>, onWait?: (waitMs: number) => void): Promise<T> {
      const existing = pending.get(key) as Promise<T> | undefined;
      if (existing) {
        if (!onWait) return existing;
        // Joiner path: time the await of the shared flight in a wrapper async
        // fn, so `onWait` runs in the JOINER's own async context (ambient
        // AsyncLocalStorage attribution lands on the joiner, not the starter).
        // `finally`-based so a rejecting flight still reports the wait.
        return (async () => {
          const t0 = performance.now();
          try {
            return await existing;
          } finally {
            onWait(performance.now() - t0);
          }
        })();
      }
      // Delete in `finally` so a rejection clears the key too — the next caller
      // retries fresh instead of inheriting a stale failed promise forever.
      const p = (async () => {
        try {
          return await fn();
        } finally {
          pending.delete(key);
        }
      })();
      pending.set(key, p);
      return p;
    },
    get size() {
      return pending.size;
    },
  };
}
