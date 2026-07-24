// The shared shapes of the wedge-proof spawn primitive.
//
// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: the impls next door
// own `node:fs`. This plugin must never be imported from `web/`.

/** Options for the capture-shaped spawns (`spawnCaptured` / `spawnExpectOk`). */
export interface SpawnOptions {
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
  /**
   * Hard wall-clock ceiling for the child, in ms. On expiry the child is sent
   * `SIGTERM`, then `SIGKILL` after a short grace, and the result comes back
   * with `timedOut: true` — a RESULT, not a throw, so the caller classifies it.
   *
   * One-shot deadline, not a polling loop, and deliberately opt-in: omitting it
   * keeps the historical "no ceiling" behavior, because for most callers a hung
   * child is the fleet watchdog's problem and a silent local timeout would just
   * absorb the hang. Set it only where the CALLER owns a deadline it must honor
   * (an HTTP request that cannot hang on a wedged network peer).
   */
  timeoutMs?: number;
}

/** What a completed capture-shaped spawn returns. */
export interface SpawnResult {
  /** ≠ 0 is a legitimate result — the caller branches. `spawnExpectOk` throws instead. */
  exitCode: number;
  signalCode: string | null;
  /**
   * True when `opts.timeoutMs` expired and WE killed the child. An explicit
   * flag rather than something to infer from `signalCode`: a child can be
   * SIGTERM'd by anyone (the op-wedge watchdog, a user ^C), so the signal alone
   * never says whose deadline fired.
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

/** Options for `spawnPassthrough` (stdout/stderr inherit, stdin ignore). */
export interface SpawnPassthroughOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  background?: boolean;
  /** Called synchronously after spawn with `{ pid, kill }` (signal forwarding). */
  onSpawn?: (child: SpawnedChild) => void;
}

export interface SpawnPassthroughResult {
  exitCode: number;
  signalCode: string | null;
  resourceUsage: { maxRssBytes: number | undefined };
}
