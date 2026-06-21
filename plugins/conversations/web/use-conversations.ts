import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useResource, type ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { ConversationSchema, conversationsResource, type ConversationListPayload } from "@plugins/tasks/plugins/tasks-core/core";
import { cursorPageSchema } from "@plugins/primitives/plugins/cursor-pagination/core";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { isActiveStatus } from "../core";
import { getConversation } from "../core/endpoints";
import { type ConversationEntry } from "../core/resources";

const EMPTY_CONVERSATIONS: ConversationEntry[] = [];

export const GonePageSchema = cursorPageSchema(ConversationSchema);

export type ConversationsState =
  | { pending: true }
  | {
      pending: false;
      active: ConversationEntry[];
      recentGone: ConversationEntry[];
      hasMoreGone: boolean;
      totalGoneCount: number;
      system: ConversationEntry[];
    };

export function useConversations(): ConversationsState {
  const q = useResource(conversationsResource);
  if (q.pending) return { pending: true };
  return {
    pending: false,
    active: q.data.active,
    recentGone: q.data.recentGone,
    hasMoreGone: q.data.hasMoreGone,
    totalGoneCount: q.data.totalGoneCount,
    system: q.data.system,
  };
}

// Point lookup by id. Subscribes to a derived SLICE of the conversations list
// (just this id's row) via useResource's `select`, so the component re-renders
// only when THAT conversation changes — not on every push to the shared list.
// This is the load-bearing fix for the O(C²) re-render storm where ~175
// per-conversation toolbar components all observe the same global list.
export function useConversation(id: string): ConversationEntry | null {
  const select = useCallback(
    (p: ConversationListPayload): ConversationEntry | null =>
      p.active.find((x) => x.id === id) ??
      p.recentGone.find((x) => x.id === id) ??
      p.system.find((x) => x.id === id) ??
      null,
    [id],
  );
  const q = useResource(conversationsResource, undefined, { select });
  return q.pending ? null : q.data;
}

// Derived SLICE: does this task have another active conversation? Subscribes
// only to that boolean via `select`, so the component re-renders only when the
// answer flips — not on every conversations push. Used by drop-and-exit.
//
// Returns the gateable result (NOT a bare boolean): the answer decides a
// DESTRUCTIVE action, so callers must distinguish "loading" from "no sibling"
// — collapsing pending to `false` is exactly the wrong-default-while-loading
// bug. `gate: true` makes the pending→settled flip re-render reliably.
export function useHasActiveSiblings(
  taskId: string,
  excludeId: string,
): ResourceResult<boolean> {
  const select = useCallback(
    (p: ConversationListPayload) =>
      p.active.some((c) => c.taskId === taskId && c.id !== excludeId),
    [taskId, excludeId],
  );
  return useResource(conversationsResource, undefined, { select, gate: true });
}

// Derived SLICE: is there another active conversation in this worktree? Used by
// push-and-exit to decide between Exit and Drop & Exit. Gateable for the same
// reason as useHasActiveSiblings — the answer picks a destructive default.
export function useHasActiveSiblingInWorktree(
  worktreePath: string,
  excludeId: string,
): ResourceResult<boolean> {
  const select = useCallback(
    (p: ConversationListPayload) =>
      p.active.some(
        (c) =>
          c.id !== excludeId &&
          c.worktreePath === worktreePath &&
          isActiveStatus(c.status),
      ),
    [worktreePath, excludeId],
  );
  return useResource(conversationsResource, undefined, { select, gate: true });
}

// Derived SLICE: the active list only. Narrows away recentGone/system/gone-count
// churn so consumers re-render only when an active row changes. Used by the
// dependencies button's cross-task picker.
export function useActiveConversations(): ConversationEntry[] {
  const select = useCallback((p: ConversationListPayload) => p.active, []);
  const q = useResource(conversationsResource, undefined, { select });
  return q.pending ? EMPTY_CONVERSATIONS : q.data;
}

// Point lookup by id. Checks the live WS-backed resource first (real-time
// updates for recent conversations), falling back to a one-shot fetch for
// conversations older than the sidebar's bounded recent-gone window.
export function useConversationById(id: string | null): ConversationEntry | null {
  const liveConv = useConversation(id ?? "");
  const q = useQuery({
    queryKey: ["conversation", id],
    queryFn: async (): Promise<ConversationEntry | null> => {
      try {
        return await fetchEndpoint(getConversation, { id: id! });
      } catch (err) {
        if (err instanceof EndpointError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: id !== null && liveConv === null,
    staleTime: Infinity,
  });
  return liveConv ?? q.data ?? null;
}
