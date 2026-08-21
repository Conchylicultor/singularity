/**
 * The catchable fatal signals an op command (`build`, `check`, `push`) turns
 * into a graceful `process.exit`, so its `process.on("exit")` cleanup — worktree
 * op markers, the push holder, the build receipt, the verdict guard — runs
 * instead of being skipped by a default-disposition death.
 *
 * The map is `128 + signo`, the shell's own encoding for "died from signal N".
 * It lived triplicated verbatim in `build.ts`, `check.ts` and `push.ts`; this
 * file is its one owner.
 *
 * SIGKILL and SIGSTOP are deliberately absent: they are uncatchable, and each
 * command has its own backstop for them (the receipt left at `running` with a
 * dead pid, the flock the kernel drops, the marker's pid-liveness check).
 */
export const FATAL_SIGNAL_EXITS = [
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129],
  ["SIGQUIT", 131],
] as const;

/** One of the catchable fatal signals this module installs a handler for. */
export type FatalSignal = (typeof FATAL_SIGNAL_EXITS)[number][0];

/** The shell's encoding of "died from signal N", and the offset that undoes it. */
const SIGNAL_EXIT_BASE = 128;

/**
 * The POSIX signal number behind one of the exit codes above.
 *
 * This is the `128 + signo` identity in the map's own docblock, read backwards —
 * NOT a second table of signal numbers that could drift from the first. Callers
 * that need a signo (the native tap keys its records by one) derive it here
 * rather than hardcoding `SIGTERM === 15` somewhere else.
 */
export function signoOf(exitCode: number): number {
  return exitCode - SIGNAL_EXIT_BASE;
}

/**
 * What is known about a signal that ended this process. Recorded when the
 * signal arrives, read on the exit path — so the receipt and the verdict can
 * both say "killed from outside" rather than "failed".
 */
export interface SignalTermination {
  /** The signal that arrived, e.g. `SIGTERM`. */
  signal: FatalSignal;
  /** When it arrived, ISO-8601. */
  at: string;
  /**
   * Who sent it, already rendered for display. Unset today: `process.on(sig, …)`
   * carries no sender identity. Populated by the native SA_SIGINFO tap in step 2
   * of `research/2026-08-07-global-signal-origin-attribution.md`.
   */
  attribution?: string;
}

export interface FatalSignalExitOptions {
  /**
   * Called with the signal (and the exit code it maps to) BEFORE `process.exit`,
   * so a command can record the death as a fact while the process is still
   * alive. Must be synchronous and cheap; it runs on the death path.
   */
  onSignal?: (signal: FatalSignal, exitCode: number) => void;
  /**
   * Runs once, AFTER every `process.on(sig, …)` above has been registered.
   *
   * This ordering is load-bearing, not cosmetic. **Bun installs its own
   * `sigaction` lazily, on the first `process.on(sig)` for that signal, and does
   * not chain to whatever was there before.** So anything that installs a native
   * handler for these signals must do so *after* this loop, or Bun will silently
   * overwrite it and the tap will never fire. This callback is the seam that
   * guarantees the right order: the native `signal-origin` tap of step 3 of
   * `research/2026-08-07-global-signal-origin-attribution.md` arms here, and
   * nowhere else.
   */
  afterInstall?: (signals: readonly FatalSignal[]) => void;
}

/**
 * Install the catchable-fatal-signal → graceful-exit handlers.
 *
 * Registers one listener per signal in `FATAL_SIGNAL_EXITS`; each records the
 * death via `onSignal` (if given) and then exits with that signal's code, which
 * runs every `process.on("exit")` handler already registered, in registration
 * order. Call this AFTER the command's own exit hooks so they are in place when
 * a signal lands.
 */
export function installFatalSignalExit(
  options: FatalSignalExitOptions = {},
): void {
  // Step 1: the listeners. This is where Bun sigactions each signal.
  for (const [signal, exitCode] of FATAL_SIGNAL_EXITS) {
    process.on(signal, () => {
      options.onSignal?.(signal, exitCode);
      process.exit(exitCode);
    });
  }
  // Step 2: anything that must sit UNDERNEATH Bun's handler — see the docblock
  // on `afterInstall`. Never move this above the loop.
  options.afterInstall?.(FATAL_SIGNAL_EXITS.map(([signal]) => signal));
}
