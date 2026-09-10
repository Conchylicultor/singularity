import {
  withHostGrant,
  inheritedGrant,
} from "@plugins/infra/plugins/host/plugins/host-admission/server";
import type {
  Grant,
  GrantHooks,
  Lane,
} from "@plugins/infra/plugins/host/plugins/host-admission/core";
import {
  checkoutNamespace,
  MAIN_WORKTREE_NAME,
} from "@plugins/infra/plugins/paths/server";
import type { Namespace } from "@plugins/infra/plugins/namespace/core";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";
import type { OpKind } from "@plugins/infra/plugins/worktree/core";
import {
  markWorktreeOpStart,
  setWorktreeOpPhase,
  clearWorktreeOp,
} from "@plugins/infra/plugins/worktree/server";
import {
  createOpProfiler,
  type OpProfiler,
} from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import type { OutcomeByKind } from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { checkBroadcasts } from "./broadcasts";
import { reportInterruptedPredecessor } from "./build-receipt";
import { installFatalSignalExit } from "./fatal-signals";
import { signalOriginTap } from "./signal-origin-tap";
import { publishLane } from "./lane";

// The lifecycle of a DIRECT op — one whose only entry ticket is the host CPU
// grant: `check`, `test`, and an `e2e` script run. Before this file the whole
// sequence lived inline in the check command, and `test` / `e2e` needed the
// identical sequence: identity, the broadcast banner, the interrupted
// predecessor, the lane, the worktree op marker (waiting-for-lock → running),
// the op-log profiler (requested → granted → completed), a graceful exit on a
// catchable fatal signal with signal-origin attribution, and the grant itself —
// or the parent's INHERITED grant when this process is nested inside another op.
// Three hand-rolled copies of that sequence is how the three copies of
// `PushContentionRecord` drifted; so it is one function, and the commands own
// only what is genuinely theirs: what to run under the grant, and what the
// outcome means.
//
// `build` and `push` are NOT direct ops. A build's entry ticket is the
// per-worktree build lock and it later queues on the duress valve and the host
// grant; a push's is the global push mutex. They keep their own lifecycles.

/** What the body learns about the op it runs inside. */
export interface DirectOpContext<K extends OpKind> {
  /** The op-marker slug: this checkout's namespace. */
  slug: Namespace;
  branch: string;
  lane: Lane;
  /** This run's id — names its op-log record, its kill line, its transcript. */
  opId: string;
  /**
   * True iff this process inherited its grant from a parent op (a check spawned
   * by `build` / `push`). A nested op writes no marker, no op-log record, and
   * installs no signal handlers — the parent already owns all three, and a
   * second set would double-count the time and churn the status.
   */
  nested: boolean;
  /** `undefined` exactly when `nested`: a nested op records nothing of its own. */
  profiler: OpProfiler<K> | undefined;
}

export interface DirectOpOptions {
  /**
   * How many host CPU units to ask for when acquiring a grant of our own. The
   * acquire is elastic — it hands back the slots it could get, `>= 1` — so this
   * is a ceiling, not a demand: `cpuBudget().B` for work that fans out (a check
   * pass, a vitest worker pool), `1` for a single process driving a browser.
   */
  max: number;
  /**
   * Adopt a parent-supplied id rather than minting one. Nested-only by
   * contract (the check command's `--run-id`): a top-level op must mint its
   * own, because that id also names its op-log row, and adopting a parent's
   * would collide with the parent's records. The caller validates that rule —
   * this primitive only honours the id it is handed.
   */
  opId?: string;
}

/**
 * The seams a test injects. Every one defaults to the real thing; nothing here
 * is a mock in production. The shape follows `ValveDeps` in admission-valve.ts.
 */
export interface DirectOpDeps {
  inheritedGrant: () => Grant | undefined;
  withHostGrant: <T>(
    opts: { lane: Lane; max: number; hooks?: GrantHooks },
    fn: (grant: Grant) => Promise<T>,
  ) => Promise<T>;
  identity: () => Promise<{ slug: Namespace; branch: string }>;
  checkBroadcasts: (kind: OpKind) => Promise<void>;
  reportInterruptedPredecessor: (slug: Namespace) => void;
  publishLane: (isInteractiveOrigin: boolean) => void;
  createOpProfiler: typeof createOpProfiler;
  markWorktreeOpStart: typeof markWorktreeOpStart;
  setWorktreeOpPhase: typeof setWorktreeOpPhase;
  clearWorktreeOp: typeof clearWorktreeOp;
  /** Register an exit-time cleanup (`process.on("exit", …)`). */
  onExit: (fn: () => void) => void;
  installFatalSignalExit: (opId: string, slug: Namespace) => void;
}

// This worktree's identity: the op-marker slug (this checkout's namespace,
// matching what `build` / `push` write — see worktree-op.ts) and the branch the
// op record carries. `getWorktreeRoot()` is the shared, process-memoized
// git-root helper (one spawn regardless of caller count); the branch is one
// more `git rev-parse`. Moved here verbatim from the check command, which was
// the one direct op until test and e2e joined it.
async function getWorktreeIdentity(): Promise<{
  slug: Namespace;
  branch: string;
}> {
  const root = await getWorktreeRoot();
  const branchResult = await spawnCaptured(
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    // Wedge-breaker for a metadata-only git read; the op body this precedes is
    // the genuinely long-running part, and it is the one marked `unbounded`.
    { timeoutMs: 60_000 },
  );
  const branch = branchResult.stdout.trim();
  if (branchResult.exitCode !== 0 || !branch) {
    console.error(
      `Could not determine the current branch (git rev-parse said: ${branchResult.stdout.trim()})`,
    );
    process.exit(1);
  }
  // A direct op runs against the main composition only — same reading as
  // `build`, where the checkout is the variable half of the pair, which is what
  // `checkoutNamespace` names.
  return { slug: await checkoutNamespace(root), branch };
}

const realDeps: DirectOpDeps = {
  inheritedGrant,
  withHostGrant,
  identity: getWorktreeIdentity,
  checkBroadcasts,
  reportInterruptedPredecessor,
  publishLane,
  createOpProfiler,
  markWorktreeOpStart,
  setWorktreeOpPhase,
  clearWorktreeOp,
  onExit: (fn) => process.on("exit", fn),
  // The tap arms here, and its sink is a direct op's ONLY record of a death: a
  // direct op owns no deploy receipt, so without the line an externally-killed
  // check/test leaves nothing behind but a cleared marker. The signal→exit-code
  // map is shared with `build` and `push`; see ./fatal-signals.ts.
  installFatalSignalExit: (opId, slug) =>
    installFatalSignalExit(signalOriginTap({ opId, worktree: slug })),
};

/**
 * Run `body` as a direct op of `kind`.
 *
 * Sequence, on the top-level path: broadcasts → identity → interrupted
 * predecessor → lane → profiler `requested` + marker `waiting-for-lock` + exit
 * handler + fatal-signal exit → host grant (its queue recorded as a
 * `host-grant` wait) → marker `running` + profiler `granted` → `body` →
 * profiler `completed`. The marker is cleared on every graceful exit — the
 * `finally` below, and the exit handler for a `process.exit` inside `body` —
 * and a SIGKILL self-heals through the marker's pid-liveness check.
 *
 * On the NESTED path (a parent's grant in the environment) only the lane is
 * published — not-clobbered, so the parent's classification wins — and `body`
 * runs on the inherited grant with `ctx.nested === true` and no profiler.
 *
 * `body` returns the outcome to stamp on the terminal record, and it owns the
 * process exit code: this primitive never calls `process.exit`. A `body` that
 * throws stamps no outcome; the exit handler's `write()` lands it as `error`,
 * which is the truth about it.
 */
export async function withDirectOp<K extends OpKind>(
  kind: K,
  opts: DirectOpOptions,
  body: (grant: Grant, ctx: DirectOpContext<K>) => Promise<OutcomeByKind[K]>,
  deps: DirectOpDeps = realDeps,
): Promise<OutcomeByKind[K]> {
  // NESTING, resolved before anything acts on it. A parent op hands this child
  // its host CPU grant in the environment; we spend those units WITHOUT
  // acquiring host-wide again — no double-acquire, no deadlock. Its presence is
  // also the single answer to "did a parent already do this?", which every
  // gate below reads. "This op has a marker of its own" and "this op contends
  // for a grant of its own" are one fact, not two.
  const inherited = deps.inheritedGrant();
  const nested = inherited !== undefined;

  // The parent printed the same banner before it spawned us, and a nested op
  // re-printing it is pure noise.
  if (!nested) await deps.checkBroadcasts(kind);

  const { slug, branch } = await deps.identity();

  // An interrupted build prints no verdict and sets no exit code its caller
  // can see, so the next op is where it surfaces. Direct ops are very often
  // run to validate what a build just deployed. Gated for the same reason as
  // the banner: the parent already announced its predecessor.
  if (!nested) deps.reportInterruptedPredecessor(slug);

  // A direct op on the main worktree is human-blocking (interactive), any other
  // is background. `publishLane` not-clobbers: a parent op's `grant.env()`
  // always sets SINGULARITY_LANE, so a nested op reads the parent's
  // classification here rather than reclassifying off its own branch — that
  // is how a push-nested check keeps `interactive` even on an agent branch.
  // Left UNCONDITIONAL; a `!nested` gate would be a second rule saying the
  // same thing. See ./lane.ts.
  const isInteractiveOrigin = slug === MAIN_WORKTREE_NAME;
  const lane: Lane = isInteractiveOrigin ? "interactive" : "background";
  deps.publishLane(isInteractiveOrigin);

  const opId = opts.opId ?? crypto.randomUUID();

  const profiler = nested
    ? undefined
    : deps.createOpProfiler(kind, { opId, branch, opSlug: slug, lane });

  if (!nested) {
    profiler?.markRequested();
    // Written up-front as "waiting-for-lock" and flipped to "running" once the
    // grant is held, so an op queued for its grant reads as queued.
    deps.markWorktreeOpStart(slug, kind, "waiting-for-lock");
    deps.onExit(() => {
      deps.clearWorktreeOp(slug, kind);
      // The terminal record, on every graceful exit — including a
      // `process.exit(1)` inside `body`, which skips the `finally`. Idempotent,
      // and an outcome already stamped by `complete()` wins; a path that exits
      // without one lands as "error", which is the truth about it.
      profiler?.write();
    });
    // Catchable fatal signals → graceful exit so the exit handler above runs
    // (the wrapper's orphan SIGTERM tears this worker down cleanly). SIGKILL is
    // uncatchable; the marker's pid-liveness check is the self-heal there.
    deps.installFatalSignalExit(opId, slug);
  }

  const ctx: DirectOpContext<K> = {
    slug,
    branch,
    lane,
    opId,
    nested,
    profiler,
  };

  try {
    const runUnder = async (grant: Grant): Promise<OutcomeByKind[K]> => {
      // The grant is now held — on the top-level path this runs only after
      // acquisition; flip the marker (a no-op when nested, where the parent
      // owns the status). The host grant IS a direct op's entry ticket: it does
      // no further waiting after this point.
      if (!nested) deps.setWorktreeOpPhase(slug, kind, "running");
      profiler?.markGranted();
      const outcome = await body(grant, ctx);
      profiler?.complete(outcome);
      return outcome;
    };
    return inherited
      ? await runUnder(inherited)
      : // `grantHooks()` is what makes this queue visible as a `host-grant`
        // wait — the wait that made a direct check an invisible contender.
        await deps.withHostGrant(
          { lane, max: opts.max, hooks: profiler?.grantHooks() },
          runUnder,
        );
  } finally {
    if (!nested) deps.clearWorktreeOp(slug, kind);
  }
}
