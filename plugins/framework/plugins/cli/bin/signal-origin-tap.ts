import { armSignalOrigin, readSignalOrigin } from "@plugins/packages/plugins/signal-origin/server";
import type { SignalOrigin } from "@plugins/packages/plugins/signal-origin/core";
import {
  FATAL_SIGNAL_EXITS,
  signoOf,
  type FatalSignal,
  type FatalSignalExitOptions,
} from "./fatal-signals";
import { recordSignalOriginLine } from "./signal-origin-log";

export interface SignalOriginTapOptions {
  /**
   * What names this op in the sink — `build_runs.id` for a build, the push id
   * for a push, the check's own run id for a check. Must be unique per run: it
   * is the only key a reader has to find the lines of one death.
   */
  opId: string;
  /** The worktree the op is running in, for a human reading the sink. */
  worktree: string;
  /**
   * Anything the command wants to do with the death BEYOND the sink line, on
   * the same synchronous death path — `build` stamps its receipt and builds the
   * termination its verdict guard prints. Runs after the line is written, so a
   * throw here can never cost the durable record.
   */
  onSignal?: (signal: FatalSignal, origin: SignalOrigin | null) => void;
}

/**
 * The signal-origin tap expressed once, as the hook pair `installFatalSignalExit`
 * takes. `build`, `check` and `push` all pass this and differ only in what their
 * own `onSignal` does with the origin.
 *
 * Both halves are load-bearing:
 *
 * - `afterInstall` is where the native SA_SIGINFO tap arms, and it may not move.
 *   **Bun installs its own `sigaction` lazily on the first `process.on(sig)` and
 *   does NOT chain**, so a tap armed before that loop is silently overwritten
 *   and never fires. `afterInstall` is the seam that guarantees the order; see
 *   its docblock in fatal-signals.ts.
 * - `onSignal` reads the slot the tap filled — by then the native handler has
 *   already run (it sits underneath Bun's own and chains up to it), so the read
 *   is the sender's identity rather than a guess — and writes the sink line.
 *
 * An arm failure is recorded rather than printed. A banner on every op on a
 * machine without a C toolchain would be noise in exactly the transcript this
 * feature exists to keep readable; the sink is where the absence goes on the
 * record, so a later unattributed death is explainable rather than mysterious.
 * `origin: null` on a `signal` line means the same thing from the other side:
 * "we looked and could not see", never "nobody sent a signal".
 */
export function signalOriginTap(options: SignalOriginTapOptions): FatalSignalExitOptions {
  const { opId, worktree } = options;
  return {
    onSignal: (signal, exitCode) => {
      const origin = readSignalOrigin(signoOf(exitCode));
      recordSignalOriginLine({ event: "signal", buildId: opId, worktree, signal, origin });
      options.onSignal?.(signal, origin);
    },
    afterInstall: () => {
      const armed = armSignalOrigin(FATAL_SIGNAL_EXITS.map(([, code]) => signoOf(code)));
      if (!armed.armed) {
        recordSignalOriginLine({ event: "arm-failed", buildId: opId, worktree, reason: armed.reason });
      }
    },
  };
}
