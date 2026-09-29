import type {
  GrantHooks,
  Lane,
} from "@plugins/infra/plugins/host/plugins/host-admission/core";
import type { OpKind } from "@plugins/infra/plugins/worktree/core";
import type {
  OpEvent,
  OpStep,
  OpSummary,
  OpWait,
  OutcomeByKind,
  WaitKind,
  WaitResult,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { appendOpLog } from "./jsonl";

// The writer. Emits the v2 change-only event stream (see
// research/2026-09-29-global-unified-op-status.md): one line per state CHANGE —
// `requested`, `wait-start`, `wait-end`, `requeue`, `granted` — and a
// self-contained `completed` summary as the terminal. Nothing is re-stamped: the
// reducer in `../../core` folds the deltas back into one state per op.
//
// Every event carries a per-op `seq` (so re-ingest is idempotent), the wall
// instant `at`, and `t` — monotonic ms since `requested`, the clock every wait
// offset is measured on so a wall-clock step cannot bend a duration.
//
// Every method is a closure, never a `this`-dependent method: the push command
// passes `profiler.markLockRequested`-style bare references around, so a
// `this`-bound method would break at the first call site it is handed to.

/** Identity a caller must supply; the rest is derived by the profiler. */
export interface OpProfilerOptions {
  /**
   * Unique per invocation. push: its `pushId`; build: its `buildId`; check: a
   * fresh uuid (a check has no natural id).
   */
  opId: string;
  branch: string;
  /**
   * `basename(worktree root)` — the op-marker slug, and THE identity of the
   * checkout this op ran in: the liveness key the orphan reconciler probes and
   * the key the profiling reader groups a Gantt row on. Pass
   * `checkoutNamespace(root)` — the caller's own git root.
   */
  opSlug: string | null;
  /** Which reserved-floor lane the op draws from. */
  lane?: Lane | null;
  /** push only. */
  mode?: "worktree" | "from-main";
  /** build only — joins the record to its `build-profile-<id>.json` spans. */
  buildId?: string | null;
  /**
   * Where each event lands. Defaults to appending to the real `OP_LOG_FILE`.
   * Injectable so a test can drive the profiler against an in-memory sink and
   * assert the event stream without touching the user's real log.
   */
  sink?: (event: OpEvent) => void;
}

export interface OpProfiler<K extends OpKind> {
  /**
   * Append the `requested` event. Call once, before the first wait; any other
   * event emits it first if it has not been, so the log always has identity.
   */
  markRequested(): void;
  /**
   * Open a wait on `kind`, with the cause when the writer knows one (the duress
   * latch's trip reason). Carries the current requeue cycle.
   */
  waitStart(kind: WaitKind, reason?: string | null): void;
  /** Close the currently-open wait with how it ended. No-op if none is open. */
  waitEnd(result?: WaitResult): void;
  /** Bracket `fn` as a wait of `kind`: `acquired` on return, `aborted` on throw. */
  wait<T>(kind: WaitKind, fn: () => Promise<T>): Promise<T>;
  /**
   * The op released what it had queued for and goes round again (a build's
   * duress requeue). Bumps the cycle every later wait carries.
   */
  requeue(): void;
  /**
   * Hooks to hand to `withHostGrant({ lane, max, hooks })`. Records the grant
   * queue as a `host-grant` wait. Safe to call per requeue cycle: each acquire
   * produces its OWN wait entry.
   */
  grantHooks(): GrantHooks;
  /** The primary grant is held and work starts: append `granted`. */
  markGranted(): void;
  stepStart(name: string): void;
  stepEnd(name: string): void;
  /**
   * Record a step whose duration and start instant are ALREADY known — the
   * mirror of the build profiler's `pushBuildSpan` (`cli/plugins/op-runtime/cli/profiler.ts`), for
   * a producer that reports a COMPLETED unit of work post-hoc rather than
   * bracketing it live. `checks/core`'s `onCheckDone(id, durationMs, wallStart)`
   * is exactly that shape: it fires after the check has finished, so routing it
   * through `stepStart`/`stepEnd` (which both read `Date.now()` themselves)
   * would stamp `startMs` = the check's END and `durationMs` ≈ 0 — fabricated.
   *
   * `startedAtPerfMs` is a `performance.now()` reading — the MONOTONIC clock,
   * not `Date.now()`. That is deliberate, and it is what makes the offset exact:
   * `OpStep.startMs` is a *duration* from `grantedAt`, and measuring a duration
   * requires both instants on one clock. This profiler samples `performance.now()`
   * alongside `grantedAt` in `markGranted`, so the offset is a plain monotonic
   * subtraction with NO cross-clock conversion in it.
   *
   * Converting via `performance.timeOrigin` instead would look equivalent and
   * isn't: `timeOrigin` is a wall≈monotonic snapshot taken once at process start,
   * so its capture error (measured at ~1ms idle, ~6ms under load average 20 —
   * exactly when this profiler matters most) is baked into every step for the
   * life of the process. Pairing the clocks at the reference instant has no such
   * error, and keeps the mapping in ONE place instead of at every call site.
   */
  recordStep(name: string, durationMs: number, startedAtPerfMs: number): void;
  /** Record the terminal outcome. `write()` is what lands it. */
  complete(outcome: OutcomeByKind[K]): void;
  /** Append the self-contained terminal `completed` event. Idempotent. */
  write(): void;
}

/** The open wait, in the writer's own terms (`startT` on the monotonic clock). */
interface OpenWaitState {
  kind: WaitKind;
  startT: number;
  reason: string | null;
  cycle: number;
}

export function createOpProfiler<K extends OpKind>(
  kind: K,
  opts: OpProfilerOptions,
): OpProfiler<K> {
  const conversationId = process.env.SINGULARITY_CONVERSATION_ID ?? null;
  const sink = opts.sink ?? ((event: OpEvent) => appendOpLog(event));

  const requestedAt = new Date();
  const requestedMs = requestedAt.getTime();
  /** The monotonic reading paired with `requestedAt` — `t`'s zero. */
  const requestedPerfMs = performance.now();
  /** Monotonic ms since `requested`, on the integer grid every offset uses. */
  const tNow = (): number =>
    Math.max(0, Math.round(performance.now() - requestedPerfMs));

  let grantedAt: Date | undefined;
  /**
   * `performance.now()` sampled at the same instant as `grantedAt`. The two are
   * a PAIR — the one reference point, read on both clocks — which is what lets
   * `recordStep` express a monotonic caller's start as an exact offset from a
   * wall-clock `grantedAt`. Only ever set together with `grantedAt`.
   */
  let grantedPerfMs: number | undefined;
  let completedAt: Date | undefined;
  let outcome: OutcomeByKind[K] | undefined;
  let requestedWritten = false;
  let written = false;
  let seq = 0;
  let cycle = 0;

  const waits: OpWait[] = [];
  let openWait: OpenWaitState | null = null;

  const steps: OpStep[] = [];
  const stepStarts = new Map<string, number>();

  // `OpStep.startMs` is an offset from `grantedAt` (see core/internal/types.ts).
  // Before `markGranted` there is no reference instant yet, so the step pins to
  // 0; not clamped otherwise, because a genuinely-negative offset is a real
  // signal. Rounded onto the same integer-ms grid as the waits.

  /** For `stepEnd`, whose instants are `Date.now()` — same clock as `grantedAt`. */
  const stepOffsetWall = (startedAtMs: number): number =>
    grantedAt ? Math.round(startedAtMs - grantedAt.getTime()) : 0;

  /** For `recordStep`, whose instants are `performance.now()`. */
  const stepOffsetPerf = (startedAtPerfMs: number): number =>
    grantedPerfMs != null ? Math.round(startedAtPerfMs - grantedPerfMs) : 0;

  const identity = () => ({
    kind,
    opSlug: opts.opSlug,
    branch: opts.branch,
    conversationId,
    lane: opts.lane ?? null,
    mode: opts.mode ?? null,
    buildId: opts.buildId ?? null,
  });

  type Body = OpEvent extends infer E
    ? E extends OpEvent
      ? Omit<E, "v" | "opId" | "seq" | "at" | "t">
      : never
    : never;

  const emit = (
    body: Body,
    t: number = tNow(),
    at: Date = new Date(),
  ): void => {
    seq++;
    sink({
      v: 2,
      opId: opts.opId,
      seq,
      at: at.toISOString(),
      t,
      ...body,
    } as OpEvent);
  };

  const markRequested = (): void => {
    if (requestedWritten) return;
    requestedWritten = true;
    emit({ e: "requested", ...identity(), pid: process.pid }, 0, requestedAt);
  };

  /** Every non-requested event goes through here, so identity always lands first. */
  const emitAfterRequested = (body: Body): void => {
    markRequested();
    emit(body);
  };

  const closeOpenWait = (result: WaitResult): void => {
    if (!openWait) return;
    const open = openWait;
    openWait = null;
    const endT = tNow();
    const closed: OpWait = {
      kind: open.kind,
      startMs: open.startT,
      durationMs: Math.max(0, endT - open.startT),
      reason: open.reason,
      cycle: open.cycle,
      result,
    };
    waits.push(closed);
    emitAfterRequested({
      e: "wait-end",
      wait: closed.kind,
      startMs: closed.startMs,
      durationMs: closed.durationMs,
      result,
      reason: closed.reason,
      cycle: closed.cycle,
    });
  };

  const waitStart = (
    waitKind: WaitKind,
    reason: string | null = null,
  ): void => {
    // An unclosed previous wait would otherwise be lost; close it rather than
    // silently dropping the interval.
    closeOpenWait("aborted");
    openWait = { kind: waitKind, startT: tNow(), reason, cycle };
    emitAfterRequested({ e: "wait-start", wait: waitKind, reason, cycle });
  };

  const waitEnd = (result: WaitResult = "acquired"): void => {
    closeOpenWait(result);
  };

  return {
    markRequested,
    waitStart,
    waitEnd,

    async wait<T>(waitKind: WaitKind, fn: () => Promise<T>): Promise<T> {
      waitStart(waitKind);
      let result: WaitResult = "aborted";
      try {
        const value = await fn();
        result = "acquired";
        return value;
      } finally {
        waitEnd(result);
      }
    },

    requeue: () => {
      closeOpenWait("aborted");
      cycle++;
      emitAfterRequested({ e: "requeue", cycle, cause: "duress" });
    },

    grantHooks: (): GrantHooks => ({
      // Slow path only: every slot in the lane's window is busy. That is where a
      // real grant queue starts, so that is where the segment opens.
      onWaitStart: () => waitStart("host-grant"),
      onAcquired: (waitMs: number) => {
        if (openWait?.kind === "host-grant") {
          waitEnd("acquired");
          return;
        }
        // Fast path — `onWaitStart` never fired, so `waitMs` is ≈0 by
        // construction. Only record a segment if the pool actually measured one,
        // so the bar is not littered with zero-width noise — and then as ONE
        // self-contained `wait-end`, with no `wait-start` before it.
        if (waitMs <= 0) return;
        const durationMs = Math.round(waitMs);
        const closed: OpWait = {
          kind: "host-grant",
          startMs: Math.max(0, tNow() - durationMs),
          durationMs,
          reason: null,
          cycle,
          result: "acquired",
        };
        waits.push(closed);
        emitAfterRequested({
          e: "wait-end",
          wait: closed.kind,
          startMs: closed.startMs,
          durationMs,
          result: "acquired",
          reason: null,
          cycle,
        });
      },
    }),

    markGranted: () => {
      closeOpenWait("acquired");
      // Both clocks, one instant — see `grantedPerfMs`. Kept adjacent so they
      // cannot drift apart.
      grantedAt = new Date();
      grantedPerfMs = performance.now();
      emitAfterRequested({ e: "granted" });
    },

    stepStart: (name: string) => {
      stepStarts.set(name, Date.now());
    },

    stepEnd: (name: string) => {
      const start = stepStarts.get(name);
      if (start == null) return;
      stepStarts.delete(name);
      steps.push({
        name,
        startMs: stepOffsetWall(start),
        durationMs: Date.now() - start,
      });
    },

    recordStep: (name: string, durationMs: number, startedAtPerfMs: number) => {
      steps.push({
        name,
        startMs: stepOffsetPerf(startedAtPerfMs),
        durationMs,
      });
    },

    complete: (o: OutcomeByKind[K]) => {
      completedAt = new Date();
      outcome = o;
    },

    write: () => {
      // Idempotent: the CLI wires this to both the happy path and a
      // `process.on("exit")` guard, so it can genuinely be called twice.
      if (written) return;
      written = true;
      closeOpenWait("aborted");
      markRequested();

      const completed = completedAt ?? new Date();
      // An op that ended before `markGranted` never held anything: hold is 0.
      const summary: OpSummary = {
        ...identity(),
        pid: process.pid,
        requestedAt: requestedAt.toISOString(),
        grantedAt: grantedAt?.toISOString() ?? null,
        completedAt: completed.toISOString(),
        waits: [...waits],
        holdMs: grantedAt
          ? Math.max(0, completed.getTime() - grantedAt.getTime())
          : 0,
        totalMs: Math.max(0, completed.getTime() - requestedMs),
        outcome: outcome ?? "error",
        interrupted: false,
        steps: [...steps],
      };
      emit({ e: "completed", by: "self", summary }, tNow(), completed);
    },
  };
}
