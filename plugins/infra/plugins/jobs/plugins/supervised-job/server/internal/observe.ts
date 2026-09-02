import {
  HARD_KILL_EXIT_CODE,
  isPidAlive,
  readRunTerminal,
  type RunTerminal,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";

/**
 * Where a supervised run stands, right now, according to the two things that
 * cannot lie: the exit marker on disk and the process table.
 *
 * A discriminated union rather than `RunTerminal | null`, because `null` here
 * would mean "still going" — a legitimate state — and the next reader along
 * would eventually absorb it into "ended with nothing to report".
 */
export type RunObservation =
  | { readonly state: "running" }
  | { readonly state: "ended"; readonly terminal: RunTerminal };

/**
 * Apply the close rule to one run.
 *
 * ```
 * ended?  =  !(terminal == null && isPidAlive(pid))
 * value   =  terminal ?? { exitCode: -1, signalCode: null, finishedAt: now }
 * ```
 *
 * **This is the whole correctness argument of a supervised job, so read it
 * before changing anything here.** The `supervisedRun.ended` event is only a
 * wake-up: it can be lost (the backend dying between the shim writing the
 * marker and the emit landing), it can arrive for a run whose ledger row was
 * stamped minutes earlier by the caller's own CLI, and it carries no outcome to
 * trust even if it does arrive. The marker file is the authority — written once,
 * atomically, by the shim wrapping the child, after `wait` returned and before
 * the shim exited — so every wake re-reads it and decides from scratch.
 *
 * The three arms, and why each is what it is:
 *
 * - **Marker present ⇒ ended, even while the pid is still alive.** The shim
 *   writes the marker BEFORE it exits, so the file is a terminal signal in its
 *   own right; waiting for the pid would only add latency.
 * - **No marker, pid alive ⇒ running.** The only shape a genuinely-running run
 *   has, and the only one that keeps waiting.
 * - **No marker, pid dead ⇒ hard kill.** SIGKILL runs no handler, so nothing was
 *   ever there to write a marker and nothing ever will be. {@link
 *   HARD_KILL_EXIT_CODE} (`-1`) is a status no child can produce, which keeps
 *   the case legible, and `signalCode` stays `null` because nobody OBSERVED a
 *   signal — **never re-derive killed-ness from `exitCode > 128`**, here or in
 *   a consumer: `kill -TERM` and a program calling `exit(143)` are the same
 *   number, and guessing between them is what recorded a deploy that never
 *   exited as "Exited with code 143".
 *
 * The rule is stated twice in this repo — `supervisedRun`'s own `settleRun`
 * applies it to the runs a live backend is tailing, and this applies it to the
 * run one job workflow is waiting on. They must agree; the intended end state is
 * one exported rule in `supervised-run/core` that both call.
 */
export function observeRun(
  kindId: string,
  runId: string,
  pid: number | null,
): RunObservation {
  const terminal = readRunTerminal(kindId, runId);
  if (terminal !== null) return { state: "ended", terminal };
  if (isPidAlive(pid)) return { state: "running" };
  return {
    state: "ended",
    terminal: {
      exitCode: HARD_KILL_EXIT_CODE,
      signalCode: null,
      finishedAt: new Date(),
    },
  };
}
