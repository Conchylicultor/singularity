import type { Contribution } from "@core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { ReorderSlotPrefs } from "../../shared/resource";
import type { ReorderGroup } from "@plugins/reorder/plugins/groups/core";

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

type GroupsData = {
  groups: ReorderGroup[];
  members: Array<{ contributionId: string; groupId: string; rank: Rank }>;
};

export interface ReorderState {
  visible: Contribution[];
  hidden: Contribution[];
  entries: (Contribution | SpacerItem)[];
  groupedEntries: TopLevelEntry[];
  membershipMap: Map<string, { groupId: string; rank: Rank }>;
}

export function computeReorderState(
  contributions: Contribution[],
  rankMap: ReorderSlotPrefs,
  groupsData: GroupsData | null,
): ReorderState {
  const visible: (Contribution | SpacerItem)[] = [];
  const hidden: Contribution[] = [];

  for (const c of contributions) {
    const key = contributionKey(c);
    if (!key) continue;
    if (
      rankMap[key]?.hidden &&
      !(c as Record<string, unknown>).excludeFromReorder
    ) {
      hidden.push(c);
    } else {
      visible.push(c);
    }
  }

  for (const key of Object.keys(rankMap)) {
    if (key.startsWith(SPACER_PREFIX) && rankMap[key]?.rank) {
      visible.push({ id: key, _spacer: true as const });
    }
  }

  const sorted = visible
    .map((item, naturalIdx) => ({
      item,
      naturalIdx: isSpacer(item) ? Infinity : naturalIdx,
    }))
    .sort((a, b) => {
      const ax = isSpacer(a.item)
        ? false
        : !!(a.item as Record<string, unknown>).excludeFromReorder;
      const bx = isSpacer(b.item)
        ? false
        : !!(b.item as Record<string, unknown>).excludeFromReorder;
      if (ax !== bx) return ax ? 1 : -1;
      if (ax && bx) return a.naturalIdx - b.naturalIdx;
      const ar = rankMap[entryKey(a.item)]?.rank ?? null;
      const br = rankMap[entryKey(b.item)]?.rank ?? null;
      if (ar && br) return Rank.compare(ar, br);
      if (ar) return -1;
      if (br) return 1;
      return a.naturalIdx - b.naturalIdx;
    })
    .map((row) => row.item);

  const membershipMap = new Map<string, { groupId: string; rank: Rank }>();
  if (groupsData) {
    for (const m of groupsData.members) {
      membershipMap.set(m.contributionId, {
        groupId: m.groupId,
        rank: m.rank,
      });
    }
  }

  const entries = sorted;
  const visibleContributions = sorted.filter(
    (x): x is Contribution => !isSpacer(x),
  );

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
      if (
        !isSpacer(item) &&
        (item as Record<string, unknown>).excludeFromReorder
      ) {
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
      const r = rankMap[entryKey(item)]?.rank ?? null;
      topLevel.push({ rank: r, naturalIdx: i, entry: item });
    }

    topLevel.sort((a, b) => {
      const aExcl =
        !isGroupEntry(a.entry) &&
        !isSpacer(a.entry) &&
        !!(a.entry as Record<string, unknown>).excludeFromReorder;
      const bExcl =
        !isGroupEntry(b.entry) &&
        !isSpacer(b.entry) &&
        !!(b.entry as Record<string, unknown>).excludeFromReorder;
      if (aExcl !== bExcl) return aExcl ? 1 : -1;
      if (a.rank && b.rank) return Rank.compare(a.rank, b.rank);
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.naturalIdx - b.naturalIdx;
    });

    groupedEntries = topLevel.map((t) => t.entry);
  }

  return {
    visible: visibleContributions,
    hidden,
    entries,
    groupedEntries,
    membershipMap,
  };
}
