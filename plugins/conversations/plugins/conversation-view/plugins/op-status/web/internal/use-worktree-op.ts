import { useLive } from "@plugins/network/plugins/live/web";
import { useMemo } from "react";
import {
  combineResources,
  mapResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
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
 * What a conversation's worktree is running right now. A read rather than a
 * nullable op, so "the op map has not loaded yet" (or failed to) can never
 * reach a caller as "idle": a ready `null` is a settled answer.
 */
export type WorktreeOpReading = ResourceResult<WorktreeOp | null>;

// The in-flight op for a conversation's worktree. Resolves the conversation's
// `worktreePath` (the op markers' key) from the live conversations resource,
// then reads the push-driven `worktreeOps` value — the same single source of
// truth the op-status banner renders. Both are reads: the answer is loading
// until both are known and failed if either failed; an unknown conversation
// (ready, no row) has no worktree to key on, so it reads as ready with no op.
export function useWorktreeOp(conversationId: string): WorktreeOpReading {
  const conv = useConversation(conversationId);
  const result = useLive(worktreeOps);
  return useMemo(
    () =>
      mapResource(combineResources({ conv, ops: result }), (d) =>
        d.conv ? (d.ops[slugOf(d.conv.worktreePath)] ?? null) : null,
      ),
    [conv, result],
  );
}
