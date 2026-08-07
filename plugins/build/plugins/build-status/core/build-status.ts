import { BUILD_EXIT_SUPERSEDED } from "./exit-codes";

/**
 * How a build run ended, as one closed set. Four of the six arms are *not*
 * defects — only `failed` is a build that ran to a verdict and gave a bad one:
 *
 * - `superseded` — its tree was replaced mid-run, so it never had a subject
 *   (see `BUILD_EXIT_SUPERSEDED`'s docblock).
 * - `interrupted` — its owner was hard-killed by a newer build's restart, so
 *   there is no artifact and no verdict.
 * - `killed` — a signal arrived from outside the build (SIGTERM/SIGINT/…): a
 *   human, a supervisor, another agent. Says nothing about the code.
 *
 * Everything that renders or reasons about a run's outcome goes through
 * `buildStatusOf`, so no call site branches on exit codes again.
 */
export type BuildStatus =
  | "running"
  | "success"
  | "superseded"
  | "interrupted"
  | "killed"
  | "failed";

/** The two fields that decide a status — any `BuildRun` satisfies it. */
export interface BuildRunOutcome {
  finishedAt: Date | null;
  exitCode: number | null;
}

/**
 * The exit code the ledger writes for a run whose owning process was hard-killed
 * by a newer build's restart. Deliberately outside the 0-255 wait status range,
 * so it can never collide with a code the build itself chose.
 */
const EXIT_HARD_KILLED = -1;

/**
 * POSIX shell convention: a process terminated by signal N reports 128 + N. The
 * CLI's own fatal-signal handlers already produce exactly this (SIGHUP → 129,
 * SIGINT → 130, SIGQUIT → 131, SIGTERM → 143), so no new constant is needed to
 * recognise an externally-killed build.
 */
const EXIT_SIGNAL_BASE = 128;

const SIGNAL_NAMES: Record<number, string> = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  4: "SIGILL",
  6: "SIGABRT",
  8: "SIGFPE",
  9: "SIGKILL",
  11: "SIGSEGV",
  13: "SIGPIPE",
  14: "SIGALRM",
  15: "SIGTERM",
  24: "SIGXCPU",
  25: "SIGXFSZ",
  30: "SIGUSR1",
  31: "SIGUSR2",
};

/** Total: every run has exactly one status, and it never depends on the caller. */
export function buildStatusOf(run: BuildRunOutcome): BuildStatus {
  if (run.finishedAt === null) return "running";
  const { exitCode } = run;
  if (exitCode === 0) return "success";
  if (exitCode === BUILD_EXIT_SUPERSEDED) return "superseded";
  if (exitCode === EXIT_HARD_KILLED) return "interrupted";
  if (exitCode !== null && exitCode > EXIT_SIGNAL_BASE) return "killed";
  return "failed";
}

/**
 * The POSIX signal name encoded in a `killed` run's exit code (128 + signo).
 * Total over every number: a signal we have no name for renders as `SIG<n>`
 * rather than vanishing, so the detail line always says something true.
 */
export function killedSignalName(exitCode: number): string {
  const signo = exitCode - EXIT_SIGNAL_BASE;
  return SIGNAL_NAMES[signo] ?? `SIG${signo}`;
}
