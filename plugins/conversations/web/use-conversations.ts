import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  foldResource,
  mapResource,
  combineResources,
  useResource,
  useCombinedResources,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  ConversationSchema,
  conversationsActiveResource,
  conversationsSystemResource,
  conversationsGoneResource,
  conversationsGoneStats,
  RECENT_GONE_LIMIT,
} from "@plugins/tasks/plugins/tasks-core/core";
import { cursorPageSchema } from "@plugins/primitives/plugins/cursor-pagination/core";
import {
  fetchEndpoint,
  EndpointError,
} from "@plugins/infra/plugins/endpoints/web";
import {
  isActiveStatus,
  getConversation,
  type ConversationEntry,
} from "../core";

export const GonePageSchema = cursorPageSchema(ConversationSchema);

export interface ConversationsData {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
  totalGoneCount: number;
  system: ConversationEntry[];
}

/** Every conversation list, as one read: loading, failed, or ready. */
export function useConversations(): ResourceResult<ConversationsData> {
  const active = useResource(conversationsActiveResource);
  const system = useResource(conversationsSystemResource);
  const gone = useResource(conversationsGoneResource);
  const stats = useLive(conversationsGoneStats);
  const all = useCombinedResources({ active, system, gone, stats });
  return mapResource(all, (d): ConversationsData => ({
    active: d.active,
    recentGone: d.gone,
    system: d.system,
    totalGoneCount: d.stats.totalGoneCount,
    hasMoreGone: d.stats.totalGoneCount > RECENT_GONE_LIMIT,
  }));
}

// Point lookup by id. Subscribes to a derived SLICE of each conversations list
// (just this id's row) via useResource's `select`, so the component re-renders
// only when THAT conversation changes — not on every push to a shared list.
// This is the load-bearing fix for the O(C²) re-render storm where ~175
// per-conversation toolbar components all observe the same global list. Splitting
// across the three keyed sub-resources gives strictly better isolation: a status
// flip on an active row no longer touches the gone/system subscriptions.
//
// A read, not a nullable row: a list that has the row answers at once (ready,
// with the row); otherwise it is `loading` until all three lists have answered,
// `error` if one of them failed, and a ready `null` only when every list
// answered without this id — so "not loaded yet" and "failed" never reach a
// caller as "no such conversation". `gate: true` because the three slices feed
// a readiness gate (see live-state CLAUDE.md, "Slice selectors").
export function useConversation(
  id: string,
): ResourceResult<ConversationEntry | null> {
  const select = useCallback(
    (rows: ConversationEntry[]): ConversationEntry | null =>
      rows.find((x) => x.id === id) ?? null,
    [id],
  );
  const active = useResource(conversationsActiveResource, undefined, {
    select,
    gate: true,
  });
  const gone = useResource(conversationsGoneResource, undefined, {
    select,
    gate: true,
  });
  const system = useResource(conversationsSystemResource, undefined, {
    select,
    gate: true,
  });
  return useMemo(
    () => resolveConversation(active, gone, system),
    [active, gone, system],
  );
}

/** One id's row across the three lists: the first hit, else absent once all answered. */
function resolveConversation(
  active: ResourceResult<ConversationEntry | null>,
  gone: ResourceResult<ConversationEntry | null>,
  system: ResourceResult<ConversationEntry | null>,
): ResourceResult<ConversationEntry | null> {
  // Priority active → gone (recentGone) → system, matching the lists' order.
  for (const list of [active, gone, system]) {
    if (list.status === "ready" && list.data !== null) return list;
  }
  // No hit yet: absent only once every list has answered.
  return mapResource(
    combineResources({ active, gone, system }),
    (): ConversationEntry | null => null,
  );
}

/**
 * The live row of a conversation a surface already holds, else that snapshot.
 * For a control handed a conversation by its host: while the lists load, when
 * one failed (its last-seen row first) or while the row moves between them, it
 * keeps rendering the conversation it was given rather than blanking — the
 * host owns rendering the read's failure.
 */
export function useLiveConversation<T extends { id: string }>(
  snapshot: T,
): ConversationEntry | T {
  const live = useConversation(snapshot.id);
  return foldResource(live, {
    loading: () => snapshot,
    error: (_error, stale) => stale ?? snapshot,
    ready: (row) => row ?? snapshot,
  });
}

// Derived SLICE: does this task have another active conversation? Subscribes
// only to that boolean via `select`, so the component re-renders only when the
// answer flips — not on every conversations push. Used by drop-and-exit.
//
// Returns the gateable result (NOT a bare boolean): the answer decides a
// DESTRUCTIVE action, so callers must distinguish "loading" from "no sibling"
// — collapsing loading to `false` is exactly the wrong-default-while-loading
// bug. `gate: true` makes the loading→settled flip re-render reliably.
export function useHasActiveSiblings(
  taskId: string,
  excludeId: string,
): ResourceResult<boolean> {
  const select = useCallback(
    (active: ConversationEntry[]) =>
      active.some((c) => c.taskId === taskId && c.id !== excludeId),
    [taskId, excludeId],
  );
  return useResource(conversationsActiveResource, undefined, {
    select,
    gate: true,
  });
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
  return useResource(conversationsActiveResource, undefined, {
    select,
    gate: true,
  });
}

// The active conversations list. The whole keyed resource IS the active list,
// so this is a thin pass-through of the resource result; callers branch on
// `.status` (never collapse it to a default). Used by the dependencies
// button's cross-task picker.
export function useActiveConversations(): ResourceResult<ConversationEntry[]> {
  return useResource(conversationsActiveResource);
}

// Point lookup by id. Checks the live WS-backed resource first (real-time
// updates for recent conversations), falling back to a one-shot fetch for
// conversations older than the sidebar's bounded recent-gone window.
//
// Closing a conversation moves its row from `conversations-active` to
// `conversations-gone` — two independent resources, pushed separately (active
// is debounced, gone is a full recompute). Between the two pushes the row is in
// NEITHER list, so a naive lookup reports "unknown" for a conversation we were
// just rendering: every consumer flashes its loading state (the conversation
// pane unmounts its whole body to "Loading…") and then redraws. The row did not
// become unknown — it is moving between lists — so while that lookup is still
// in flight we keep the last row we resolved for this same id. The hold ends as
// soon as either source answers (including the fetch settling to "not found").
export function useConversationById(
  id: string | null,
): ConversationEntry | null {
  // This lookup's contract is a row or null (the fallback fetch below answers
  // "not in any list"), so a list still loading or failed reads as no live row
  // here — its last-seen row first.
  const liveConv = foldResource(useConversation(id ?? ""), {
    loading: () => null,
    error: (_error, stale) => stale ?? null,
    ready: (row) => row,
  });
  const [held, setHeld] = useState<ConversationEntry | null>(null);
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
  const resolved = liveConv ?? q.data ?? null;
  // Render-phase derived state (React's sanctioned "store info from previous
  // renders" pattern): remember the latest row resolved for this id.
  if (resolved !== null && resolved !== held) setHeld(resolved);
  if (resolved !== null) return resolved;
  // `isPending` with the query enabled = the fallback fetch has not answered
  // yet, i.e. the row is between lists rather than known to be absent.
  const inTransit = id !== null && q.isPending;
  return inTransit && held?.id === id ? held : null;
}

// A worktree's slug is the basename of its checkout path — the key the op log
// (`opSlug`) and the op markers file a worktree under, and by the basename
// invariant the attempt id. Derived by hand: no node:path in the browser.
function worktreeSlugOf(worktreePath: string): string {
  const parts = worktreePath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? worktreePath;
}

const EMPTY_TITLES: Readonly<Record<string, string>> = {};

// One conversation list as a partial slug → title map.
function titleMapOf(rows: ConversationEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of rows) {
    const title = c.title?.trim();
    if (title) map[worktreeSlugOf(c.worktreePath)] = title;
  }
  return map;
}

/**
 * Worktree slug → the human title of a conversation that ran in it, so a
 * surface listing worktrees (the op-status queue, the Ops Gantt rows) reads as
 * task names rather than attempt ids. A pure client-side lookup over the three
 * live conversation lists (in the agent-manager, the main-DB set).
 *
 * Cosmetic by design: while a list loads, or if one failed, the map is empty and
 * every label falls back to its slug — the caller's own read renders its own
 * failure. Each list is subscribed through a `select` slice, so a status flip
 * in the lists re-renders the caller only when a mapping actually changes.
 */
export function useConversationTitleBySlug(): Readonly<Record<string, string>> {
  const active = useResource(conversationsActiveResource, undefined, {
    select: titleMapOf,
  });
  const gone = useResource(conversationsGoneResource, undefined, {
    select: titleMapOf,
  });
  const system = useResource(conversationsSystemResource, undefined, {
    select: titleMapOf,
  });
  return useMemo(() => {
    if (
      active.status === "ready" &&
      gone.status === "ready" &&
      system.status === "ready"
    )
      // A live `active` title wins over a stale gone / system one.
      return { ...system.data, ...gone.data, ...active.data };
    return EMPTY_TITLES;
  }, [active, gone, system]);
}
