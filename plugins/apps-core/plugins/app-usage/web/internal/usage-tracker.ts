import type { AppUsageEntry } from "../../core";
import { localDay, splitByLocalDay } from "./day-split";

/** No keyboard / pointer input for this long ⇒ the user is away; time stops. */
export const IDLE_MS = 5 * 60 * 1000;
/**
 * A long session is checkpointed (sent) once its oldest unsent time is this
 * old, on the next input — so Home stays current and a crash loses at most
 * about this much.
 */
export const CHECKPOINT_MS = 60 * 1000;
/** Retry delay after a flush the server could not take. */
export const RETRY_MS = 30 * 1000;

export interface TrackerDeps {
  now(): number;
  /** Posts a batch; rejects when it did not land. */
  send(entries: AppUsageEntry[]): Promise<void>;
  /** Whether a `send` rejection is the expected kind (server down) to retry. */
  isRetryable(err: unknown): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** The app this tab was on before a reload, so a reload is not a launch. */
  lastApp: string | undefined;
  idleMs?: number;
  checkpointMs?: number;
}

export interface UsageTracker {
  /** The focused app changed (or was first published). */
  setApp(appId: string | undefined): void;
  /** `document.visibilityState === "visible"` changed. */
  setVisible(visible: boolean): void;
  /** The window gained or lost OS focus. */
  setWindowFocused(focused: boolean): void;
  /** Keyboard / pointer activity. */
  input(): void;
  /** The page is going away: close the open stretch and send everything. */
  pageHide(): void;
  /** Stop timers (unmount). */
  dispose(): void;
}

interface Pending {
  day: string;
  appId: string;
  launches: number;
  focusedMs: number;
  lastOpenedAt: number | null;
}

/**
 * Counts launches and active time per (local day, app) and sends them in
 * batches. Event-driven: every state change arrives as a call, and the only
 * timers are one-shots (the idle deadline, a retry) — nothing polls.
 *
 * - A **launch** is the focused app becoming X when the last app was not X.
 *   `undefined` in between (a transient unpublish) does not reset it, and the
 *   last app survives a reload via `deps.lastApp`.
 * - **Active time** accrues while an app is focused AND the page is visible
 *   AND the window has focus AND there was input within `idleMs`. When the
 *   idle deadline passes, the stretch ends at the last input, so the idle
 *   wait itself is never counted.
 */
export function createUsageTracker(deps: TrackerDeps): UsageTracker {
  const idleMs = deps.idleMs ?? IDLE_MS;
  const checkpointMs = deps.checkpointMs ?? CHECKPOINT_MS;

  let appId: string | undefined;
  let lastApp = deps.lastApp;
  let visible = false;
  let windowFocused = false;
  let lastInputAt = Number.NEGATIVE_INFINITY;
  /** Start of the open active stretch, or null when not active. */
  let stretchStart: number | null = null;
  const pending = new Map<string, Pending>();
  /** When the oldest unsent delta was recorded. */
  let oldestPendingAt: number | null = null;
  let idleTimer: unknown = null;
  let retryTimer: unknown = null;
  let sending = false;
  let flushAgain = false;

  function entry(day: string, app: string): Pending {
    const key = `${day}:${app}`;
    let p = pending.get(key);
    if (!p) {
      p = { day, appId: app, launches: 0, focusedMs: 0, lastOpenedAt: null };
      pending.set(key, p);
    }
    oldestPendingAt ??= deps.now();
    return p;
  }

  function isActive(now: number): boolean {
    return (
      appId !== undefined &&
      visible &&
      windowFocused &&
      now - lastInputAt < idleMs
    );
  }

  function closeStretch(end: number): void {
    if (stretchStart === null || appId === undefined) return;
    for (const { day, ms } of splitByLocalDay(stretchStart, end))
      entry(day, appId).focusedMs += ms;
    stretchStart = null;
  }

  /** Open or close the stretch to match the current state. */
  function reconcile(): void {
    const now = deps.now();
    if (isActive(now)) stretchStart ??= now;
    else closeStretch(now);
  }

  function armIdle(): void {
    if (idleTimer !== null) return;
    const wait = Math.max(0, lastInputAt + idleMs - deps.now());
    idleTimer = deps.setTimer(onIdleDeadline, wait);
  }

  function onIdleDeadline(): void {
    idleTimer = null;
    // Input after the timer was armed moved the deadline: wait out the rest.
    if (deps.now() - lastInputAt < idleMs) {
      armIdle();
      return;
    }
    // Away: the stretch ended at the last sign of the user, not now.
    closeStretch(Math.max(lastInputAt, stretchStart ?? lastInputAt));
    flush();
  }

  function takeBatch(): AppUsageEntry[] {
    const batch = [...pending.values()]
      .filter((p) => p.launches > 0 || p.focusedMs > 0)
      .map((p) => ({
        day: p.day,
        appId: p.appId,
        launches: p.launches,
        focusedMs: Math.round(p.focusedMs),
        lastOpenedAt:
          p.lastOpenedAt === null
            ? null
            : new Date(p.lastOpenedAt).toISOString(),
      }));
    pending.clear();
    oldestPendingAt = null;
    return batch;
  }

  function restore(batch: AppUsageEntry[]): void {
    for (const e of batch) {
      const p = entry(e.day, e.appId);
      p.launches += e.launches;
      p.focusedMs += e.focusedMs;
      const at = e.lastOpenedAt === null ? null : Date.parse(e.lastOpenedAt);
      if (at !== null && (p.lastOpenedAt === null || at > p.lastOpenedAt))
        p.lastOpenedAt = at;
    }
  }

  function flush(): void {
    if (sending) {
      flushAgain = true;
      return;
    }
    const batch = takeBatch();
    if (batch.length === 0) return;
    sending = true;
    void deps
      .send(batch)
      .catch((err: unknown) => {
        if (!deps.isRetryable(err)) throw err;
        restore(batch);
        retryTimer ??= deps.setTimer(() => {
          retryTimer = null;
          flush();
        }, RETRY_MS);
      })
      .finally(() => {
        sending = false;
        if (flushAgain) {
          flushAgain = false;
          flush();
        }
      });
  }

  /** Send now, splitting the open stretch so its time so far goes too. */
  function checkpoint(): void {
    const now = deps.now();
    if (stretchStart !== null) {
      closeStretch(now);
      stretchStart = now;
    }
    flush();
  }

  function input(): void {
    lastInputAt = deps.now();
    armIdle();
    reconcile();
    const oldest = Math.min(
      stretchStart ?? Number.POSITIVE_INFINITY,
      oldestPendingAt ?? Number.POSITIVE_INFINITY,
    );
    if (lastInputAt - oldest >= checkpointMs) checkpoint();
  }

  /** A pause (page hidden, window blurred): end the stretch and send. */
  function pause(): void {
    reconcile();
    flush();
  }

  return {
    setApp(next) {
      if (next === appId) return;
      closeStretch(deps.now());
      appId = next;
      if (next !== undefined && next !== lastApp) {
        const now = deps.now();
        const p = entry(localDay(now), next);
        p.launches += 1;
        p.lastOpenedAt = now;
      }
      if (next !== undefined) lastApp = next;
      reconcile();
      flush();
    },
    setVisible(v) {
      visible = v;
      // Coming back to the page is the user's own act — it counts as input.
      if (v) input();
      else pause();
    },
    setWindowFocused(f) {
      windowFocused = f;
      if (f) input();
      else pause();
    },
    input,
    pageHide() {
      closeStretch(deps.now());
      flush();
    },
    dispose() {
      if (idleTimer !== null) deps.clearTimer(idleTimer);
      if (retryTimer !== null) deps.clearTimer(retryTimer);
      idleTimer = null;
      retryTimer = null;
    },
  };
}
