import type { GrantHooks, Lane } from "@plugins/infra/plugins/host-admission/core";
import type {
  OpenWait,
  OpKind,
  OpStep,
  OpWait,
  OutcomeByKind,
  RawOpRecord,
  WaitKind,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { appendOpLog } from "./jsonl";

// The writer. Generalizes `cli/bin/push-profiler.ts` (whose shape this copies:
// same three phases, same `steps` bracketing, same env-sourced identity, same
// `complete` + `write` split) to every op kind, and adds the wait list the push
// profiler's scalar `waitMs` could not express.
//
// Every method is a closure, never a `this`-dependent method: the push command
// already passes `profiler.markLockRequested` as a bare function reference, so a
// `this`-bound method would break at the first call site it is handed to.

/** Identity a caller must supply; the rest is read from the environment. */
export interface OpProfilerOptions {
  /**
   * Unique per invocation. push: its `pushId`; build: its `buildId`; check: a
   * fresh uuid (a check has no natural id).
   */
  opId: string;
  branch: string;
  /**
   * `basename(worktree root)` — the op-marker slug. THE liveness key
   * `finalizeOrphanedOps` probes, and deliberately not `worktree`: the two can
   * differ (`worktree` comes from `SINGULARITY_WORKTREE`).
   */
  opSlug: string | null;
  /** Which reserved-floor lane the op draws from. */
  lane?: Lane | null;
  /** push only. */
  mode?: "worktree" | "from-main";
  /** build only — joins the record to its `build-profile-<id>.json` spans. */
  buildId?: string | null;
  /**
   * Where each record lands. Defaults to appending to the real `OP_LOG_FILE`.
   * Injectable so a test can drive the profiler against an in-memory sink and
   * assert the record shape — the clock-pairing invariant `markGranted` /
   * `recordStep` maintain in particular — without touching the user's real log.
   */
  sink?: (record: RawOpRecord) => void;
}

export interface OpProfiler<K extends OpKind> {
  /** Append the up-front `requested` record. Call once, before the first wait. */
  markRequested(): void;
  /**
   * Open a wait on `kind`. Re-stamps the `requested` record so an op parked here
   * renders as blocked ON THIS RESOURCE, not on whatever it declared first.
   */
  waitStart(kind: WaitKind): void;
  /** Close the currently-open wait. No-op if none is open. */
  waitEnd(): void;
  /** Bracket `fn` as a wait of `kind` — `waitStart` / `waitEnd` with a `finally`. */
  wait<T>(kind: WaitKind, fn: () => Promise<T>): Promise<T>;
  /**
   * Hooks to hand to `withHostGrant({ lane, max, hooks })`. Records the grant
   * queue as a `host-grant` wait. Safe to call per requeue cycle: each acquire
   * produces its OWN wait entry, which is the un-merging the old single
   * `acquireHostGrant` span could not do.
   */
  grantHooks(): GrantHooks;
  /** The primary grant is held and work starts: append `granted` + final waits. */
  markGranted(): void;
  stepStart(name: string): void;
  stepEnd(name: string): void;
  /**
   * Record a step whose duration and start instant are ALREADY known — the
   * mirror of the build profiler's `pushBuildSpan` (`cli/bin/profiler.ts`), for
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
  /** Append the terminal `completed` record. Idempotent. */
  write(): void;
}

export function createOpProfiler<K extends OpKind>(
  kind: K,
  opts: OpProfilerOptions,
): OpProfiler<K> {
  const conversationId = process.env.SINGULARITY_CONVERSATION_ID ?? null;
  const worktree = process.env.SINGULARITY_WORKTREE ?? null;
  const sink = opts.sink ?? ((record: RawOpRecord) => appendOpLog(record));

  const requestedAt = new Date();
  const requestedMs = requestedAt.getTime();
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
  let written = false;

  const waits: OpWait[] = [];
  let openWait: OpenWait | null = null;

  const steps: OpStep[] = [];
  const stepStarts = new Map<string, number>();

  // `OpStep.startMs` is an offset from `grantedAt` (see core/internal/types.ts).
  // Both step writers resolve it through one of these two, so the invariant has
  // one home per clock rather than being re-derived at each writer. Before
  // `markGranted` there is no reference instant yet, so the step pins to 0; not
  // clamped otherwise, because a genuinely-negative offset is a real signal, not
  // noise to hide.
  //
  // Rounded so every step lands on the same integer-ms grid as `holdMs` and the
  // waits, whatever clock it came in on (the monotonic clock reads fractional) —
  // the same call `pushBuildSpan` makes.

  /** For `stepEnd`, whose instants are `Date.now()` — same clock as `grantedAt`. */
  const stepOffsetWall = (startedAtMs: number): number =>
    grantedAt ? Math.round(startedAtMs - grantedAt.getTime()) : 0;

  /**
   * For `recordStep`, whose instants are `performance.now()`. Subtracts against
   * `grantedPerfMs` — the monotonic reading taken in `markGranted`, i.e. at the
   * SAME instant as `grantedAt` — so the offset never crosses clocks.
   */
  const stepOffsetPerf = (startedAtPerfMs: number): number =>
    grantedPerfMs != null ? Math.round(startedAtPerfMs - grantedPerfMs) : 0;

  const identity = (): RawOpRecord => ({
    phase: "requested",
    opId: opts.opId,
    kind,
    opSlug: opts.opSlug,
    branch: opts.branch,
    conversationId,
    worktree,
    lane: opts.lane ?? null,
    mode: opts.mode ?? null,
    buildId: opts.buildId ?? null,
    requestedAt: requestedAt.toISOString(),
    waits: [...waits],
    openWait,
  });

  // Land the full identity plus the wait state so far. Called up-front and again
  // on every wait open/close: three phases, but `requested` is the one that is
  // re-stamped, because the reader can only attribute an in-flight op's wait
  // from what is already on disk.
  const stampRequested = (): void => {
    sink(identity());
  };

  const closeOpenWait = (): void => {
    if (!openWait) return;
    waits.push({
      kind: openWait.kind,
      startMs: openWait.startMs,
      durationMs: Math.max(0, Date.now() - new Date(openWait.startedAt).getTime()),
    });
    openWait = null;
  };

  const waitStart = (waitKind: WaitKind): void => {
    // An unclosed previous wait would otherwise be lost; close it rather than
    // silently dropping the interval.
    closeOpenWait();
    const now = new Date();
    openWait = {
      kind: waitKind,
      startMs: Math.max(0, now.getTime() - requestedMs),
      startedAt: now.toISOString(),
    };
    stampRequested();
  };

  const waitEnd = (): void => {
    if (!openWait) return;
    closeOpenWait();
    stampRequested();
  };

  return {
    markRequested: stampRequested,
    waitStart,
    waitEnd,

    async wait<T>(waitKind: WaitKind, fn: () => Promise<T>): Promise<T> {
      waitStart(waitKind);
      try {
        return await fn();
      } finally {
        waitEnd();
      }
    },

    grantHooks: (): GrantHooks => ({
      // Slow path only: every slot in the lane's window is busy. That is where a
      // real grant queue starts, so that is where the segment opens.
      onWaitStart: () => waitStart("host-grant"),
      onAcquired: (waitMs: number) => {
        if (openWait?.kind === "host-grant") {
          waitEnd();
          return;
        }
        // Fast path — `onWaitStart` never fired, so `waitMs` is ≈0 by
        // construction. Only record a segment if the pool actually measured one,
        // so the bar is not littered with zero-width noise.
        if (waitMs <= 0) return;
        waits.push({
          kind: "host-grant",
          startMs: Math.max(0, Date.now() - waitMs - requestedMs),
          durationMs: waitMs,
        });
        stampRequested();
      },
    }),

    markGranted: () => {
      closeOpenWait();
      // Both clocks, one instant — see `grantedPerfMs`. Kept adjacent so they
      // cannot drift apart.
      grantedAt = new Date();
      grantedPerfMs = performance.now();
      // Minimal: identity already landed on the `requested` record. This is what
      // flips the synthesized row from "waiting" to "running" and freezes the
      // wait list at its final value.
      sink({
        phase: "granted",
        opId: opts.opId,
        grantedAt: grantedAt.toISOString(),
        waits: [...waits],
      } satisfies RawOpRecord);
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
      steps.push({ name, startMs: stepOffsetPerf(startedAtPerfMs), durationMs });
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
      closeOpenWait();

      // An op killed before `markGranted` has no real grant instant; treat the
      // request instant as the grant so `holdMs` is 0 rather than negative.
      const granted = grantedAt ?? requestedAt;
      const completed = completedAt ?? new Date();

      sink({
        ...identity(),
        phase: "completed",
        grantedAt: granted.toISOString(),
        completedAt: completed.toISOString(),
        openWait: null,
        holdMs: Math.max(0, completed.getTime() - granted.getTime()),
        totalMs: Math.max(0, completed.getTime() - requestedMs),
        outcome: outcome ?? "error",
        steps,
      } satisfies RawOpRecord);
    },
  };
}
