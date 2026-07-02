export interface Semaphore {
  /**
   * Run `fn` once a slot is free, releasing the slot when it settles. Slots are
   * handed to waiters in FIFO order. The slot is released in a `finally`, so a
   * rejecting `fn` never leaks a slot — `run` rejects with the same error.
   *
   * `onWait`, if given, is called once with the milliseconds spent waiting for a
   * slot (≈0 when one was immediately free) at the moment of acquisition, before
   * `fn` runs. It lets callers make the gate observable — e.g. record a span for
   * queue-wait — without coupling this primitive to a profiler. Kept separate
   * from `fn`'s own timing so queue-wait is never conflated with work time.
   */
  run<T>(fn: () => Promise<T>, onWait?: (waitMs: number) => void): Promise<T>;

  /**
   * Observability-only snapshot of current occupancy: how many `run` bodies
   * hold a slot, how many are queued, and the configured cap. Lets a gate
   * owner expose a gauge — e.g. sample occupancy into a flight recorder —
   * without coupling this primitive to a profiler. Reads existing counters;
   * zero hot-path cost.
   */
  stats(): { active: number; queued: number; max: number };
}

/**
 * Bounded-concurrency gate: at most `max` `run` bodies execute at once; the rest
 * queue FIFO. A counter + waiter queue, nothing more — pair it with a profiler
 * span or DB pool to cap how many callers hit a shared resource simultaneously.
 */
export function createSemaphore(max: number): Semaphore {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`createSemaphore: max must be a positive integer, got ${max}`);
  }
  let active = 0;
  const waiters: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < max) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
  }

  function release(): void {
    const next = waiters.shift();
    // Hand the freed slot directly to the head waiter — `active` stays at `max`,
    // so no second caller can race into the same slot. Only when nobody is
    // waiting does the slot actually free up.
    if (next) next();
    else active--;
  }

  return {
    async run<T>(fn: () => Promise<T>, onWait?: (waitMs: number) => void): Promise<T> {
      const t0 = onWait ? performance.now() : 0;
      await acquire();
      onWait?.(performance.now() - t0);
      try {
        return await fn();
      } finally {
        release();
      }
    },
    stats: () => ({ active, queued: waiters.length, max }),
  };
}
