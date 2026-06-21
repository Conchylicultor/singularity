import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useResource,
  useCombinedResources,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  ConversationSchema,
  conversationsActiveResource,
  conversationsSystemResource,
  conversationsGoneResource,
  conversationsGoneStatsResource,
  RECENT_GONE_LIMIT,
} from "@plugins/tasks/plugins/tasks-core/core";
import { cursorPageSchema } from "@plugins/primitives/plugins/cursor-pagination/core";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { isActiveStatus } from "../core";
import { getConversation } from "../core/endpoints";
import { type ConversationEntry } from "../core/resources";

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
  const active = useResource(conversationsActiveResource);
  const system = useResource(conversationsSystemResource);
  const gone = useResource(conversationsGoneResource);
  const stats = useResource(conversationsGoneStatsResource);
  const all = useCombinedResources({ active, system, gone, stats });
  if (all.pending) return { pending: true };
  return {
    pending: false,
    active: all.data.active,
    recentGone: all.data.gone,
    system: all.data.system,
    totalGoneCount: all.data.stats.totalGoneCount,
    hasMoreGone: all.data.stats.totalGoneCount > RECENT_GONE_LIMIT,
  };
}

// Point lookup by id. Subscribes to a derived SLICE of each conversations list
// (just this id's row) via useResource's `select`, so the component re-renders
// only when THAT conversation changes — not on every push to a shared list.
// This is the load-bearing fix for the O(C²) re-render storm where ~175
// per-conversation toolbar components all observe the same global list. Splitting
// across the three keyed sub-resources gives strictly better isolation: a status
// flip on an active row no longer touches the gone/system subscriptions.
export function useConversation(id: string): ConversationEntry | null {
  const select = useCallback(
    (rows: ConversationEntry[]): ConversationEntry | null =>
      rows.find((x) => x.id === id) ?? null,
    [id],
  );
  const active = useResource(conversationsActiveResource, undefined, { select });
  const gone = useResource(conversationsGoneResource, undefined, { select });
  const system = useResource(conversationsSystemResource, undefined, { select });
  // Priority active → gone (recentGone) → system, matching the previous order.
  const activeHit = active.pending ? null : active.data;
  const goneHit = gone.pending ? null : gone.data;
  const systemHit = system.pending ? null : system.data;
  return activeHit ?? goneHit ?? systemHit ?? null;
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
    (active: ConversationEntry[]) =>
      active.some((c) => c.taskId === taskId && c.id !== excludeId),
    [taskId, excludeId],
  );
  return useResource(conversationsActiveResource, undefined, { select, gate: true });
}

// Derived SLICE: is there another active conversation in this worktree? Used by
// push-and-exit to decide between Exit and Drop & Exit. Gateable for the same
// reason as useHasActiveSiblings — the answer picks a destructive default.
export function useHasActiveSiblingInWorktree(
  worktreePath: string,
  excludeId: string,
): ResourceResult<boolean> {
  const select = useCallback(
    (active: ConversationEntry[]) =>
      active.some(
        (c) =>
          c.id !== excludeId &&
          c.worktreePath === worktreePath &&
          isActiveStatus(c.status),
      ),
    [worktreePath, excludeId],
  );
  return useResource(conversationsActiveResource, undefined, { select, gate: true });
}

// The active conversations list. The whole keyed resource IS the active list,
// so this is a thin pass-through of the resource result; callers gate on
// `.pending` (never collapse it to a default). Used by the dependencies
// button's cross-task picker.
export function useActiveConversations(): ResourceResult<ConversationEntry[]> {
  return useResource(conversationsActiveResource);
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
