import type { Lane } from "@plugins/infra/plugins/host-admission/core";

// The one durable record for every op that competes for a host resource. Before
// this, `push`, `build`, and `check` each hand-rolled their own lifecycle
// logging (or, for `check`, none at all), and the duplication had already caused
// real drift — three independent copies of `PushContentionRecord`, two
// near-identical orphan reconcilers. See
// research/2026-07-17-global-op-log-unified-wait-profiling.md.

/**
 * What kind of op this is. Deliberately IDENTICAL to `WorktreeOp`
 * (`infra/worktree/server`, `worktree-op.ts:26`), which already models exactly
 * this vocabulary. That plugin's markers are ephemeral by design (one file per
 * op, overwritten, no history) so they cannot BE the durable store — but the
 * durable store speaks their vocabulary rather than inventing a second one.
 */
export type OpKind = "build" | "push" | "check";

/**
 * The distinct resources an op can block on. Which one an op is parked in IS the
 * diagnosis: `push-mutex` = self-queued behind another push; `build-lock` =
 * queued behind another build in the same worktree; `host-grant` = host CPU
 * starved by the rest of the fleet; `duress-valve` = held out of a storm by the
 * cluster sentinel.
 */
export type WaitKind = "push-mutex" | "build-lock" | "host-grant" | "duress-valve";

/**
 * One blocked interval. `startMs` is relative to the op's `requestedAt`, NOT to
 * the previous wait: an op's waits are interleaved with real work (a build does
 * migrations and codegen between releasing the build lock and queueing for the
 * host grant), so the segments are painted at their true offsets inside the
 * op's span rather than packed head-to-tail.
 */
export interface OpWait {
  kind: WaitKind;
  startMs: number;
  durationMs: number;
}

/** One named work step, relative to `grantedAt` (mirrors the legacy push steps). */
export interface OpStep {
  name: string;
  startMs: number;
  durationMs: number;
}

/**
 * The terminal outcomes each kind may report. Per-kind because they genuinely
 * differ — only a push can fail its rebase — and keying `createOpProfiler` on
 * this makes `complete("failed_rebase")` a tsc error on a build.
 */
export interface OutcomeByKind {
  build: "success" | "failed" | "error";
  push: "success" | "failed_rebase" | "failed_checks" | "failed_push" | "error";
  check: "success" | "failed" | "error";
}

/** Any outcome a writer may stamp on a terminal record. */
export type TerminalOutcome = OutcomeByKind[OpKind];

/**
 * A record's outcome as the READER sees it: a writer-stamped terminal, or one of
 * the two synthetic states the fold derives for an op that has not written a
 * terminal record yet.
 */
export type OpOutcome = TerminalOutcome | "waiting" | "running";

/** The currently-open wait carried on an in-flight `requested` record. */
export interface OpenWait {
  kind: WaitKind;
  /** Offset from `requestedAt`, so a closed wait keeps the same `startMs`. */
  startMs: number;
  startedAt: string;
}

/**
 * The wire shape — one JSON object per line in `~/.singularity/op-log.jsonl`.
 * Every field but `phase`/`opId` is optional at the raw level: a non-terminal
 * record is partial by design, and a record written by an older CLI must never
 * make the reader throw.
 *
 * Three phases, mirroring the live-bar behaviour the push log already has (see
 * research/2026-06-04-global-push-lock-wait-live-profiling.md):
 *
 * | phase       | written when                        | carries                       |
 * |-------------|-------------------------------------|-------------------------------|
 * | `requested` | before the first wait, and re-stamped on every wait open/close | full identity, `requestedAt`, `waits` closed so far, `openWait` |
 * | `granted`   | the op stops queuing for its ENTRY ticket and starts its own work | `opId`, `grantedAt`, `waits[]` so far |
 * | `completed` | terminal                            | everything + the accumulated `waits[]` + `outcome` + `steps` |
 *
 * `granted` is NOT "this op will never block again" — for push and build the
 * most important wait comes after it (push: the nested checks' host-grant;
 * build: duress-valve + host-grant, minutes of work after the build lock). So
 * `waits` keeps growing past `granted`, and a `granted` record's own `waits[]`
 * is a point-in-time snapshot, not the final list. See the plugin's CLAUDE.md.
 *
 * `requested` is re-stamped (rather than written once) so an op parked in its
 * SECOND wait still renders attributed: without it the reader could only ever
 * name the first resource an op declared, which for a build — build-lock, then
 * minutes of duress-valve and host-grant — is the wrong one exactly when it
 * matters. Re-stamping is append-only and costs ≤ 2 lines per wait.
 */
export interface RawOpRecord {
  phase: "requested" | "granted" | "completed";
  opId: string;
  kind?: OpKind;
  /**
   * `basename(worktree root)` — the op-marker slug `isWorktreeOpActive()` reads,
   * and the liveness key the orphan reconciler probes. Carried explicitly
   * because it is NOT the same as `worktree` (env `SINGULARITY_WORKTREE`), which
   * may differ.
   */
  opSlug?: string | null;
  worktree?: string | null;
  branch?: string;
  conversationId?: string | null;
  /** Which reserved-floor lane the op drew from — explains WHY it waited. */
  lane?: Lane | null;
  /** push only. */
  mode?: "worktree" | "from-main" | null;
  /** build only — joins to `build-profile-<id>.json` for the span breakdown. */
  buildId?: string | null;
  requestedAt?: string;
  grantedAt?: string;
  completedAt?: string | null;
  waits?: OpWait[];
  openWait?: OpenWait | null;
  holdMs?: number;
  totalMs?: number;
  outcome?: TerminalOutcome;
  interrupted?: boolean;
  steps?: OpStep[];
}

/**
 * The READ model: one folded record per op. Total by construction — every field
 * is resolved, so a consumer never re-derives a default. Produced only by
 * `foldOpRecords`.
 */
export interface OpRecord {
  opId: string;
  kind: OpKind;
  opSlug: string | null;
  worktree: string | null;
  branch: string;
  conversationId: string | null;
  lane: Lane | null;
  mode: "worktree" | "from-main" | null;
  buildId: string | null;
  requestedAt: string;
  grantedAt: string;
  completedAt: string | null;
  /**
   * Every distinct interval this op spent blocked. A LIST, not a scalar: an op
   * genuinely blocks on several resources in sequence (build: build-lock →
   * duress-valve → host-grant), and collapsing them to one number is precisely
   * what made today's build stalls unattributable.
   */
  waits: OpWait[];
  /** DERIVED: `sum(waits.durationMs)`. The scalar the stats panes still want. */
  waitMs: number;
  holdMs: number;
  totalMs: number;
  outcome: OpOutcome;
  /**
   * True for ops hard-killed mid-flight and closed by `finalizeOrphanedOps`.
   * They have no real end, so they carry no duration and render as a
   * fixed-width marker rather than a bar.
   */
  interrupted: boolean;
  steps: OpStep[];
}
