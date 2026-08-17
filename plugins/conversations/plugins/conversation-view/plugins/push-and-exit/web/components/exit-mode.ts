import {
  standingOf,
  type AttemptWork,
} from "@plugins/tasks/plugins/attempt-work/core";
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";

export type Mode =
  | "send"
  | "queue"
  | "push-and-exit"
  | "exit"
  | "exit-error"
  | "drop-and-exit"
  | "go"
  | "restore"
  | "stop";

/**
 * Structural view of the `useCombinedResources({ work, hasSibling, files })`
 * result: a `CombinedResources<…>` is assignable to it. Spelled structurally so
 * the derivation (and its test) stay pure — no React, no live-state import.
 * (`standingOf` is a pure function over the payload, so importing it costs
 * nothing at runtime.)
 *
 * Three structural echoes of the readiness/value gate:
 * - The settled arm carries NO `error`. `pending` now means "no trustworthy
 *   value" — the gate folds a never-loaded resource AND an errored one into the
 *   pending arm — so a value you can read is one the server currently vouches
 *   for. `error` is only consultable on the pending arm.
 * - `files` is the edited-files `Resolvable` payload (spelled structurally to
 *   keep the live-state import out): the loader returns a first-class
 *   "no trustworthy worktree" non-value instead of lying with `[]`.
 * - `work` is the attempt-standing `Resolvable`, in the same shape and for the
 *   same reason. It replaces what used to be a `pushes` array, and that swap is
 *   the whole point of this file: an empty array of push rows was read as proof
 *   that the attempt had pushed nothing, but those rows are written by a
 *   background ingest job that can lag arbitrarily far behind git. "No rows
 *   ingested yet" and "nothing was pushed" were the same value, so a
 *   conversation whose branch was already merged into `main` was offered the
 *   destructive "Drop & Close" as fact. The standing is now measured from git,
 *   and it arrives either measured or as an explicit non-value — there is no
 *   array here whose emptiness can be misread.
 */
export type ExitDecision =
  | { pending: true; error: Error | null }
  | {
      pending: false;
      data: {
        work:
          | { resolved: true; value: AttemptWork }
          | { resolved: false; reason: string };
        hasSibling: boolean;
        files:
          | { resolved: true; value: readonly { path: string }[] }
          | { resolved: false; reason: string };
      };
    };

export type ExitModeInput = {
  conversation: { attemptId: string } | null;
  live: { status: ConversationStatus } | null;
  draftEmpty: boolean;
  exitDecision: ExitDecision;
};

/**
 * The button's whole decision, as a pure function. `provisional` means "we do
 * not know yet" — the caller renders the mode disabled.
 */
export function deriveExitMode({
  conversation,
  live,
  draftEmpty,
  exitDecision,
}: ExitModeInput): { mode: Mode; provisional: boolean } {
  if (!conversation || !live) return { mode: "exit", provisional: false };
  if (live.status === "gone" || live.status === "done")
    return { mode: "restore", provisional: false };
  // A draft while the agent is working is queued (pasted without a C-c
  // interrupt) rather than sent immediately — surface that as "Queue".
  if (!draftEmpty)
    return {
      mode: live.status === "working" ? "queue" : "send",
      provisional: false,
    };
  if (live.status === "working") return { mode: "stop", provisional: false };
  // `pending` now means "no trustworthy value": the readiness gate folds a
  // never-loaded resource AND an errored one into this arm, so an errored exit
  // decision surfaces HERE (a settled decision carries no `.error` to consult).
  // Any of the three resources erroring makes the decision undecidable, so the
  // mode is a generic, non-destructive, still-clickable "Close (state unknown)"
  // — never the destructive default on a failure. `error` null ⇒ genuinely still
  // loading ⇒ neutral provisional Close.
  if (exitDecision.pending)
    return exitDecision.error
      ? { mode: "exit-error", provisional: false }
      : { mode: "exit", provisional: true };
  const { work, hasSibling, files } = exitDecision.data;
  // The edited-file set is a `Resolvable`: the loader returns a first-class
  // "no trustworthy worktree" non-value rather than lying with `[]`. An
  // unresolved set is as undecidable as an errored resource — surface the same
  // non-destructive "Close (state unknown)" BEFORE `files.value.length` is even
  // expressible, so the destructive "Drop & Close" default is unreachable by
  // construction, not by a remembered guard.
  if (!files.resolved) return { mode: "exit-error", provisional: false };
  if (files.value.length > 0) {
    if (files.value.every((f) => f.path.startsWith("research/")))
      return { mode: "go", provisional: false };
    return { mode: "push-and-exit", provisional: false };
  }
  // The standing is only consulted once the worktree is known to be clean. That
  // order is deliberate: uncommitted edits already decide the mode above, so an
  // unmeasurable standing degrades only the cases that actually depend on it,
  // rather than turning every dirty worktree into "Close (state unknown)".
  if (!work.resolved) return { mode: "exit-error", provisional: false };
  // Exhaustive on purpose, with no `default`: a future standing arm becomes a
  // tsc error here instead of quietly falling into one of these branches. Note
  // what is NOT written anywhere below — no count compared to zero. The
  // destructive "Drop & Close" is now reachable only from a `"none"` that git
  // measured, never from an absence of knowledge.
  switch (standingOf(work.value)) {
    // Committed but never pushed: the worktree is clean, yet real commits sit on
    // the branch ahead of `main`. This used to read as droppable.
    case "pending":
      return { mode: "push-and-exit", provisional: false };
    // Already merged into `main` (or corroborated by a push row). Closing is the
    // only correct action; dropping the task would discard landed work.
    case "landed":
      return { mode: "exit", provisional: false };
    // Nothing at stake, measured. An active sibling in the same worktree still
    // means the task is in use, so only a lone dead-end attempt offers the drop.
    case "none":
      return {
        mode: hasSibling ? "exit" : "drop-and-exit",
        provisional: false,
      };
  }
}
