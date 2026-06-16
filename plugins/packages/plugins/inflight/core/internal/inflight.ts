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
   */
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
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
    run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = pending.get(key) as Promise<T> | undefined;
      if (existing) return existing;
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
