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
 */
export type ExitDecision =
  | { pending: true; error: Error | null }
  | {
      pending: false;
      error: Error | null;
      data: {
        pushes: readonly { attemptId: string }[];
        hasSibling: boolean;
        files: readonly { path: string }[];
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
  if (exitDecision.pending) return { mode: "exit", provisional: true };
  // An errored resource is NOT an empty one. `useResource` hands back the
  // descriptor's initial data (`[]` for edited-files) alongside a non-null
  // error, and `combineResources` settles with `pending: false` while
  // propagating that error. Without this guard an errored `files` would be
  // indistinguishable from a genuinely clean worktree and would arm the
  // destructive "Drop & Close" default — on a failure. Any of the three
  // resources erroring makes the exit decision undecidable, so the mode is a
  // generic, non-destructive, still-clickable "Close (state unknown)".
  if (exitDecision.error) return { mode: "exit-error", provisional: false };
  const { pushes, hasSibling, files } = exitDecision.data;
  if (files.length > 0) {
    if (files.every((f) => f.path.startsWith("research/")))
      return { mode: "go", provisional: false };
    return { mode: "push-and-exit", provisional: false };
  }
  const hasPush = pushes.some((p) => p.attemptId === conversation.attemptId);
  if (hasPush) return { mode: "exit", provisional: false };
  return { mode: hasSibling ? "exit" : "drop-and-exit", provisional: false };
}
