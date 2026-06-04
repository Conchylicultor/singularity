import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useConversation } from "@plugins/conversations/web";
import { worktreeOpsResource, type WorktreeOp } from "../../shared";

// The op markers are keyed on the worktree directory basename, exactly how the
// status poller keys them (`basename(worktreePath)`). Avoid node:path in the
// browser — derive the basename by hand. Mirrors the banner's own `slugOf`.
export function slugOf(worktreePath: string): string {
  const parts = worktreePath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? worktreePath;
}

// The in-flight build/push op for a conversation's worktree, or null. Resolves
// the conversation's `worktreePath` (the op markers' key) from the live
// conversations resource, then reads the push-driven `worktree-ops` resource —
// the same single source of truth the op-status banner renders.
export function useWorktreeOp(conversationId: string): WorktreeOp | null {
  const conv = useConversation(conversationId);
  const result = useResource(worktreeOpsResource);
  if (!conv || result.pending) return null;
  return result.data[slugOf(conv.worktreePath)] ?? null;
}
