// The shared shapes of the wedge-proof spawn primitive.
//
// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: the impls next door
// own `node:fs`. This plugin must never be imported from `web/`.

/**
 * The BOUND half of `SpawnOptions` — the two ways a caller can promise that
 * this child cannot run forever. Named separately so a wrapper can take "just
 * the bound" as one parameter, and so the eventual step that makes a bound
 * MANDATORY is a change to this one type rather than to every option list.
 *
 * Both members are still optional today: an unbounded spawn remains legal and
 * is what most existing callers do.
 */
export interface SpawnBound {
  /**
   * Hard wall-clock ceiling for the child, in ms. On expiry the child is sent
   * `SIGTERM`, then `SIGKILL` after a short grace, and the result comes back
   * with `timedOut: true` — a RESULT, not a throw, so the caller classifies it.
   *
   * One-shot deadline, not a polling loop, and deliberately opt-in: omitting it
   * keeps the historical "no ceiling" behavior, because for a caller with no
   * deadline of its own a silent local timeout would just absorb the hang.
   * Nothing else bounds such a child — a hung one hangs until a human notices.
   * Set it where the CALLER owns a deadline it must honor (an HTTP request that
   * cannot hang on a wedged network peer; a reaper holding a host-wide flock).
   */
  timeoutMs?: number;
  /**
   * Ambient cancellation: when it aborts, the child gets the same
   * `SIGTERM` → grace → `SIGKILL` escalation as a deadline, and the call
   * **THROWS `signal.reason`** once the child is reaped.
   *
   * The asymmetry with `timeoutMs` (result field) is deliberate. `timeoutMs` is
   * the caller's OWN deadline, so the caller is the right place to classify it.
   * An abort is ambient — "everything you are doing has been abandoned" — and a
   * result field would be absorbed: a caller whose `catch`/branch maps a failed
   * probe to a conservative default would swallow it and then go on to do a
   * hundred more spawns after being told to stop. That is the absorbed-failure
   * pattern the repo bans, so the abort is a throw the caller cannot mistake for
   * a value. It also means `spawnExpectOk` needs no special case: the abort
   * propagates before the exit-code check, so it is never mis-reported as
   * `SpawnFailedError`.
   *
   * `signal.reason` is rethrown as-is (the standard `AbortSignal` contract), not
   * wrapped in a fresh error, so whoever aborted can attach context that surfaces
   * at the wedge site.
   *
   * Two edges worth knowing:
   * - **Abort beats `timedOut`.** If both fire, in either order, the call
   *   throws; it never returns a `timedOut: true` result.
   * - **An abort after a clean exit still throws**, discarding a good result.
   *   Correct — the caller was told to stop before it was handed the value — but
   *   surprising if you expect "the work finished, so it counts".
   */
  signal?: AbortSignal;
}

/** Options for the capture-shaped spawns (`spawnCaptured` / `spawnExpectOk`). */
export interface SpawnOptions extends SpawnBound {
  /** Working directory of the child. Defaults to the parent's cwd. */
  cwd?: string;
  /** FULL environment replacement — the same contract as `Bun.spawn`'s `env`. */
  env?: Record<string, string | undefined>;
  /**
   * Whole-buffer stdin, delivered via a temp-file fd (the child reads it and
   * then sees EOF). There is deliberately no streaming form — a JS-side stream
   * pull is the exact machinery this plugin exists to remove.
   */
  stdin?: string | Uint8Array;
  /** Demote the child (and its whole subtree): argv := backgroundArgv(argv). */
  background?: boolean;
  /** Redirect stderr into the stdout fd (2>&1). `result.stderr` is then `""`. */
  mergeStderr?: boolean;
}

/** What a completed capture-shaped spawn returns. */
export interface SpawnResult {
  /** ≠ 0 is a legitimate result — the caller branches. `spawnExpectOk` throws instead. */
  exitCode: number;
  signalCode: string | null;
  /**
   * True when `opts.timeoutMs` expired and WE killed the child. An explicit
   * flag rather than something to infer from `signalCode`: a child can be
   * SIGTERM'd by anyone (a user ^C, an operator killing a tree by hand), so the
   * signal alone never says whose deadline fired.
   */
  timedOut: boolean;
  /** Lazy, cached utf8 decode of `stdoutBytes`. */
  stdout: string;
  /** Lazy, cached utf8 decode of `stderrBytes`. Always `""` under `mergeStderr`. */
  stderr: string;
  /** Raw output bytes, for byte-offset parsers (`git cat-file --batch` framing). */
  stdoutBytes: Uint8Array;
  stderrBytes: Uint8Array;
  resourceUsage: { maxRssBytes: number | undefined };
}

/** The live child handle `spawnPassthrough` exposes for signal forwarding. */
export interface SpawnedChild {
  pid: number;
  kill: (signal?: number | NodeJS.Signals) => void;
}

/** Options for `spawnPassthrough` (stdout/stderr inherit, stdin ignore by default). */
export interface SpawnPassthroughOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  background?: boolean;
  /**
   * The child's stdin. Defaults to `"ignore"`: the exec-shaped build/push steps
   * read no input, and an inherited stdin would let a child silently consume the
   * parent's.
   *
   * `"inherit"` is for a child that must be INDISTINGUISHABLE from the parent —
   * today only the CLI bootstrap's post-install re-exec (`bin/reexec.ts`), which
   * hands the user's own command to a fresh process. There, `"ignore"` would be a
   * behavior change hiding in a fd: invisible until the day a command reads
   * stdin, and then only on the rare install path.
   */
  stdin?: "ignore" | "inherit";
  /** Called synchronously after spawn with `{ pid, kill }` (signal forwarding). */
  onSpawn?: (child: SpawnedChild) => void;
}

export interface SpawnPassthroughResult {
  exitCode: number;
  signalCode: string | null;
  resourceUsage: { maxRssBytes: number | undefined };
}
