/**
 * What the thread was doing, in words its stack cannot say.
 *
 * Some work leaves no JS frame on a sample at all: while Bun loads and evaluates
 * a module for an `await import()`, the stack reads `(anonymous) [Unknown
 * Executable] < processTicksAndRejections` and nothing else. A reader of such a
 * sample can only call it `native`. An ACTIVITY is the caller saying, around
 * that work, "the thread is importing this barrel now" — and the sampler stamps
 * it onto every sample taken inside the interval (see `StackSample.activity`).
 *
 * Recorded as INTERVALS on `performance.now()`, never as a current value read at
 * drain time: a consumer drains after a block ends, by which time the activity
 * that caused the block has long been cleared.
 *
 * An activity marks WHEN, not WHO: every sample inside the interval carries it,
 * including another task's work that ran while the marked one awaited. A consumer
 * uses it to name samples that have nothing better (no source frame), never to
 * override a frame that names its owner.
 */
export interface ThreadActivity {
  /** The kind of work, stable across instances — a tally key (`barrel import`). */
  name: string;
  /** This instance (a repo-relative path, an id) — the tally's detail. */
  detail: string;
}

interface Interval {
  activity: ThreadActivity;
  startMs: number;
  /** `null` while the activity is still running. */
  endMs: number | null;
}

/**
 * A safety cap, not the bound in practice: the draining sampler prunes every
 * finished interval each drain. This only matters for an armed sampler whose
 * owner stopped draining.
 */
const MAX_INTERVALS = 10_000;

export interface ActivityLog {
  /** Start recording. Until then `begin` records nothing — no sampler, no reader. */
  arm(): void;
  begin(activity: ThreadActivity, nowMs: number): Interval | null;
  end(interval: Interval | null, nowMs: number): void;
  /** The most recently begun activity whose interval contains `ms`, or null. */
  at(ms: number): ThreadActivity | null;
  /** Drop every interval that ended before `ms`. */
  prune(ms: number): void;
}

export function createActivityLog(): ActivityLog {
  let armed = false;
  // Ordered by `startMs` — `begin` appends with a monotonic clock.
  let intervals: Interval[] = [];
  return {
    arm() {
      armed = true;
    },
    begin(activity, nowMs) {
      if (!armed) return null;
      if (intervals.length >= MAX_INTERVALS) {
        intervals = intervals.slice(intervals.length / 2);
      }
      const interval: Interval = { activity, startMs: nowMs, endMs: null };
      intervals.push(interval);
      return interval;
    },
    end(interval, nowMs) {
      if (interval) interval.endMs = nowMs;
    },
    at(ms) {
      for (let i = intervals.length - 1; i >= 0; i--) {
        const interval = intervals[i]!;
        if (interval.startMs > ms) continue;
        if (interval.endMs === null || interval.endMs >= ms) {
          return interval.activity;
        }
      }
      return null;
    },
    prune(ms) {
      intervals = intervals.filter(
        (interval) => interval.endMs === null || interval.endMs >= ms,
      );
    },
  };
}

/** The process's one log — the one the process's one sampler reads. */
export const processActivityLog = createActivityLog();

/**
 * Run `work` as `activity`: every stack sample taken between its start and its
 * settle carries the activity. Records nothing (and costs one branch) in a
 * process whose sampler was never claimed.
 */
export async function withThreadActivity<T>(
  activity: ThreadActivity,
  work: () => Promise<T>,
): Promise<T> {
  const interval = processActivityLog.begin(activity, performance.now());
  try {
    return await work();
  } finally {
    processActivityLog.end(interval, performance.now());
  }
}
