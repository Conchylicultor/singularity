import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { ReorderDirective } from "../../shared/directive";
import type { ReorderGroup } from "@plugins/reorder/plugins/groups/core";

// A spacer is a synthetic token in `directive.order` of the form
// `__spacer__<unique-id>`. It renders as a blank draggable gap; it never touches
// `hidden` and never joins a group. App-created tokens use `crypto.randomUUID()`;
// hand-authored duplicates are de-duplicated on read in `applyDirective`.
export const SPACER_PREFIX = "__spacer__";

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
  return (c._pluginName as string | undefined) ?? (c.id as string | undefined) ?? "Item";
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
 * Apply a reorder directive over the LIVE contribution catalog.
 *
 * Implemented as a positional WALK of `directive.order`, which lets spacer
 * tokens materialize at their `order` positions while preserving non-spacer
 * behavior exactly:
 *  - `hidden`: contributions whose `entryKey ∈ directive.hidden` are removed
 *    (but `excludeFromReorder` items are NEVER hidden).
 *  - `order`: walked left-to-right —
 *      • a `SPACER_PREFIX` token emits a `{ id, _spacer: true }` spacer (deduped:
 *        a repeated token is skipped, so hand-authored duplicates can't collide);
 *      • a token matching a visible non-excluded contribution emits that
 *        contribution and marks it consumed;
 *      • any other token (drift: removed/unknown/hidden contribution) is skipped.
 *    Unconsumed visible non-excluded contributions are then appended in natural
 *    runtime order.
 *  - `excludeFromReorder` items stay pinned last in natural order (as before).
 *
 * New contributions append; removed ones are silently ignored — a changing
 * catalog never invalidates a saved directive. Groups stay DB-backed and the
 * membership construction is unchanged.
 */
export function applyDirective(
  contributions: Contribution[],
  directive: ReorderDirective,
  groupsData: GroupsData | null,
): ReorderState {
  const hiddenSet = new Set(directive.hidden);

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

  // Walk the order array, emitting spacers (deduped) and consuming contributions.
  const sorted: (Contribution | SpacerItem)[] = [];
  const emittedSpacers = new Set<string>();
  for (const token of directive.order) {
    if (token.startsWith(SPACER_PREFIX)) {
      if (emittedSpacers.has(token)) continue;
      emittedSpacers.add(token);
      sorted.push({ id: token, _spacer: true as const });
    } else if (byKey.has(token)) {
      sorted.push(byKey.get(token)!);
      byKey.delete(token);
    }
    // else: drift (removed/unknown/hidden contribution) → skip.
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
      // Groups carry a DB rank; ungrouped items are placed by the directive order
      // already baked into their `naturalIdx` (the index within `ungrouped`,
      // which preserves the directive-sorted `entries` order). A group sorts
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
