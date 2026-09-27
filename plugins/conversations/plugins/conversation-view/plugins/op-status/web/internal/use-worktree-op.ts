import { useLive } from "@plugins/network/plugins/live/web";
import { useConversation } from "@plugins/conversations/web";
import { worktreeOps, type WorktreeOp } from "../../shared";

// The op markers are keyed on the worktree directory basename, exactly how the
// status poller keys them (`basename(worktreePath)`). Avoid node:path in the
// browser — derive the basename by hand. Mirrors the banner's own `slugOf`.
export function slugOf(worktreePath: string): string {
  const parts = worktreePath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? worktreePath;
}

/**
 * What a conversation's worktree is running right now. A union rather than a
 * nullable op, so "the op map has not loaded yet" can never reach a caller as
 * "idle": `op: null` is a settled answer.
 */
export type WorktreeOpReading =
  { pending: true } | { pending: false; op: WorktreeOp | null };

// The in-flight op for a conversation's worktree. Resolves the conversation's
// `worktreePath` (the op markers' key) from the live conversations resource,
// then reads the push-driven `worktreeOps` value — the same single source of
// truth the op-status banner renders. `useConversation` answers null both for
// an unknown id AND while its own conversations resources are still loading
// (it has no pending state yet — that lands with the conversations tree
// migration, item 3); either way there is no worktree to key on, so this
// reads as settled with no op. Harmless for the one caller (the row chip
// renders nothing for both), but it is a known pending collapse.
export function useWorktreeOp(conversationId: string): WorktreeOpReading {
  const conv = useConversation(conversationId);
  const result = useLive(worktreeOps);
  if (result.pending) return { pending: true };
  if (!conv) return { pending: false, op: null };
  return { pending: false, op: result.data[slugOf(conv.worktreePath)] ?? null };
}
