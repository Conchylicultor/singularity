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
 * Structural view of the `useCombinedResources({ pushes, hasSibling, files })`
 * result: a `CombinedResources<…>` is assignable to it. Spelled structurally so
 * the derivation (and its test) stay pure — no React, no live-state import.
 *
 * Two structural echoes of the readiness/value gate:
 * - The settled arm carries NO `error`. `pending` now means "no trustworthy
 *   value" — the gate folds a never-loaded resource AND an errored one into the
 *   pending arm — so a value you can read is one the server currently vouches
 *   for. `error` is only consultable on the pending arm.
 * - `files` is the edited-files `Resolvable` payload (spelled structurally to
 *   keep the live-state import out): the loader returns a first-class
 *   "no trustworthy worktree" non-value instead of lying with `[]`.
 */
export type ExitDecision =
  | { pending: true; error: Error | null }
  | {
      pending: false;
      data: {
        pushes: readonly { attemptId: string }[];
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
    return { mode: live.status === "working" ? "queue" : "send", provisional: false };
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
  const { pushes, hasSibling, files } = exitDecision.data;
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
  const hasPush = pushes.some((p) => p.attemptId === conversation.attemptId);
  if (hasPush) return { mode: "exit", provisional: false };
  return { mode: hasSibling ? "exit" : "drop-and-exit", provisional: false };
}
