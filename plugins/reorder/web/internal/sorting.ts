import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";
import { normalizeNode } from "@plugins/fields/plugins/reorder-tree/plugins/config/core";
import type { ReorderGroup } from "@plugins/reorder/plugins/groups/core";

// A spacer is a `{ spacer: <id> }` node in the `items` tree. It renders as a
// blank draggable gap; it is never hidden and never joins a group. App-created
// spacer ids use `crypto.randomUUID()`; hand-authored duplicates are
// de-duplicated on read in `applyTree`. The raw spacer id is the SpacerItem `.id`.
export type SpacerItem = { readonly id: string; readonly _spacer: true };

export function isSpacer(
  item: Contribution | SpacerItem,
): item is SpacerItem {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime discriminant check; TS narrows through the `as` cast
  return (item as SpacerItem)._spacer === true;
}

export type GroupEntry = {
  kind: "group";
  group: ReorderGroup;
  members: (Contribution | SpacerItem)[];
};

export type TopLevelEntry = Contribution | SpacerItem | GroupEntry;

export function isGroupEntry(entry: TopLevelEntry): entry is GroupEntry {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime discriminant check; TS narrows through the `as` cast
  return "kind" in entry && (entry as GroupEntry).kind === "group";
}

export function contributionKey(c: Contribution): string | null {
  const id = c.id as string | undefined;
  if (!id) return null;
  return c._pluginId ? `${c._pluginId}:${id}` : id;
}

export function entryKey(item: Contribution | SpacerItem): string {
  if (isSpacer(item)) return item.id;
  const id = (item.id as string | undefined) ?? "";
  return item._pluginId ? `${item._pluginId}:${id}` : id;
}

export function contributionLabel(c: Contribution): string {
  // Prefer the short, stable `id` (e.g. `allow-monitor`) over the full dotted
  // `_pluginId` path (`conversations.conversation-view.allow-monitor`) — the
  // empty-item placeholder is a compact drag affordance, not a debug label, so
  // the long path overflows narrow horizontal bands.
  return (c.id as string | undefined) ?? (c._pluginId as string | undefined) ?? "Item";
}

function excludeFromReorder(item: Contribution | SpacerItem): boolean {
  if (isSpacer(item)) return false;
  return !!(item as Record<string, unknown>).excludeFromReorder;
}

type GroupsData = {
  groups: ReorderGroup[];
  members: Array<{ contributionId: string; groupId: string; rank: Rank }>;
};

export interface ReorderState {
  visible: (Contribution | SpacerItem)[];
  hidden: Contribution[];
  entries: (Contribution | SpacerItem)[];
  groupedEntries: TopLevelEntry[];
  membershipMap: Map<string, { groupId: string; rank: Rank }>;
}

/**
 * Apply a reorder `ReorderTree` over the LIVE contribution catalog.
 *
 * Implemented as a positional WALK of the tree (via `normalizeNode`), which lets
 * spacer nodes materialize at their positions while preserving non-spacer
 * behavior exactly:
 *  - `kind:"item"` — resolve `item` against the visible-non-excluded `byKey` map.
 *      • `{ item, hidden: true }` routes that contribution to the `hidden` bucket
 *        (but `excludeFromReorder` items are NEVER hidden);
 *      • otherwise the contribution is emitted and marked consumed;
 *      • a token matching no live contribution (drift: removed/unknown) is skipped.
 *  - `kind:"spacer"` — emits a `{ id: spacer, _spacer: true }` spacer (deduped: a
 *    repeated id is skipped, so hand-authored duplicates can't collide).
 *  - `kind:"group"` — IGNORED for now (groups are deferred and stay DB-backed).
 *
 * After the walk, any live, visible-non-excluded contribution NOT named in the
 * tree is appended in natural runtime order (fail-loud — a contribution is never
 * silently dropped, even in the stale window before reconciliation).
 *
 * `excludeFromReorder` items stay pinned last in natural order (as before). The
 * groups pass below is unchanged: it reads `groupsData` (DB) and partitions the
 * tree-derived sorted list into top-level groups + ungrouped items.
 */
export function applyTree(
  contributions: Contribution[],
  tree: ReorderTree,
  groupsData: GroupsData | null,
): ReorderState {
  // First pass over the tree: collect the entryKeys explicitly marked hidden, so
  // the catalog partition can route them to the `hidden` bucket up front.
  const hiddenSet = new Set<string>();
  for (const node of tree) {
    const n = normalizeNode(node);
    if (n.kind === "item" && n.hidden) hiddenSet.add(n.item);
  }

  // Partition the live catalog into hidden / visible-non-excluded / excluded.
  // Excluded items are never in the walk working set — they are pinned last.
  const hidden: Contribution[] = [];
  const visible: Contribution[] = [];
  const excluded: Contribution[] = [];

  for (const c of contributions) {
    const key = contributionKey(c);
    if (!key) continue;
    if ((c as Record<string, unknown>).excludeFromReorder) {
      excluded.push(c);
    } else if (hiddenSet.has(key)) {
      hidden.push(c);
    } else {
      visible.push(c);
    }
  }

  // Index visible-non-excluded by entryKey; entries are deleted as consumed.
  const byKey = new Map<string, Contribution>();
  for (const c of visible) {
    byKey.set(contributionKey(c)!, c);
  }

  // Walk the tree, emitting spacers (deduped) and consuming contributions.
  const sorted: (Contribution | SpacerItem)[] = [];
  const emittedSpacers = new Set<string>();
  for (const node of tree) {
    const n = normalizeNode(node);
    if (n.kind === "spacer") {
      if (emittedSpacers.has(n.spacer)) continue;
      emittedSpacers.add(n.spacer);
      sorted.push({ id: n.spacer, _spacer: true as const });
    } else if (n.kind === "item") {
      // Hidden items were already routed to the `hidden` bucket; skip them here.
      if (n.hidden) continue;
      if (byKey.has(n.item)) {
        sorted.push(byKey.get(n.item)!);
        byKey.delete(n.item);
      }
      // else: drift (removed/unknown contribution) → skip.
    }
    // kind:"group" → ignored (deferred; groups stay DB-backed).
  }

  // Append unconsumed visible-non-excluded in natural runtime order (iterate the
  // ordered `visible` list to preserve `naturalIdx` semantics explicitly).
  for (const c of visible) {
    if (byKey.has(contributionKey(c)!)) sorted.push(c);
  }

  // Excluded items pinned last, in natural order.
  for (const c of excluded) {
    sorted.push(c);
  }

  const membershipMap = new Map<string, { groupId: string; rank: Rank }>();
  if (groupsData) {
    for (const m of groupsData.members) {
      membershipMap.set(m.contributionId, {
        groupId: m.groupId,
        rank: m.rank,
      });
    }
  }

  const entries: (Contribution | SpacerItem)[] = sorted;

  let groupedEntries: TopLevelEntry[];

  if (!groupsData || groupsData.groups.length === 0) {
    groupedEntries = entries as TopLevelEntry[];
  } else {
    const groupMembersMap = new Map<string, (Contribution | SpacerItem)[]>();
    for (const g of groupsData.groups) {
      groupMembersMap.set(g.id, []);
    }

    const ungrouped: (Contribution | SpacerItem)[] = [];
    for (const item of entries) {
      if (excludeFromReorder(item)) {
        ungrouped.push(item);
        continue;
      }
      const membership = membershipMap.get(entryKey(item));
      if (membership && groupMembersMap.has(membership.groupId)) {
        groupMembersMap.get(membership.groupId)!.push(item);
      } else {
        ungrouped.push(item);
      }
    }

    for (const [, members] of groupMembersMap) {
      members.sort((a, b) => {
        const aM = membershipMap.get(entryKey(a));
        const bM = membershipMap.get(entryKey(b));
        if (aM && bM) return Rank.compare(aM.rank, bM.rank);
        return 0;
      });
    }

    type Ranked = {
      rank: Rank | null;
      naturalIdx: number;
      entry: TopLevelEntry;
    };
    const topLevel: Ranked[] = [];

    for (const g of groupsData.groups) {
      topLevel.push({
        rank: g.rank,
        naturalIdx: Infinity,
        entry: {
          kind: "group",
          group: g,
          members: groupMembersMap.get(g.id) ?? [],
        },
      });
    }

    for (let i = 0; i < ungrouped.length; i++) {
      const item = ungrouped[i]!;
      topLevel.push({ rank: null, naturalIdx: i, entry: item });
    }

    topLevel.sort((a, b) => {
      const aExcl =
        !isGroupEntry(a.entry) && excludeFromReorder(a.entry as Contribution | SpacerItem);
      const bExcl =
        !isGroupEntry(b.entry) && excludeFromReorder(b.entry as Contribution | SpacerItem);
      if (aExcl !== bExcl) return aExcl ? 1 : -1;
      // Groups carry a DB rank; ungrouped items are placed by the tree order
      // already baked into their `naturalIdx` (the index within `ungrouped`,
      // which preserves the tree-sorted `entries` order). A group sorts
      // relative to items by its rank vs the item's position.
      if (a.rank && b.rank) return Rank.compare(a.rank, b.rank);
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.naturalIdx - b.naturalIdx;
    });

    groupedEntries = topLevel.map((t) => t.entry);
  }

  return {
    visible: sorted,
    hidden,
    entries,
    groupedEntries,
    membershipMap,
  };
}
