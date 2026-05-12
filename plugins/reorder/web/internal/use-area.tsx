import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { MdAdd, MdClose, MdSearch, MdStorefront } from "react-icons/md";
import { Input } from "@/components/ui/input";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  reorderGroupsResource,
  type ReorderGroup,
} from "@plugins/reorder/plugins/groups/core";
import { reorderPrefsResource } from "../../shared/resource";
import {
  lookupReorderConfig,
  type ReorderableSlot,
  type ReorderConfig,
} from "./area";
import { useEditMode } from "./edit-mode-store";
import { ReorderGroupBox } from "./group-box";

type BaseItem = { id: string; _pluginId?: string; excludeFromReorder?: boolean };

/** Collision-safe storage key: `pluginId:id` when a plugin owns the item. */
export function itemKey(item: { id: string; _pluginId?: string }): string {
  return item._pluginId ? `${item._pluginId}:${item.id}` : item.id;
}

// --- Spacer items -----------------------------------------------------------

export const SPACER_PREFIX = "__spacer__";

export type SpacerItem = { readonly id: string; readonly _spacer: true };

export function isSpacer(item: { id: string }): item is SpacerItem {
  return item.id.startsWith(SPACER_PREFIX);
}

// --- Group types ------------------------------------------------------------

export type { ReorderGroup } from "@plugins/reorder/plugins/groups/core";

export type GroupEntry<P> = {
  kind: "group";
  group: ReorderGroup;
  members: (P | SpacerItem)[];
};

export type TopLevelEntry<P> = P | SpacerItem | GroupEntry<P>;

export function isGroupEntry<P>(
  entry: TopLevelEntry<P>,
): entry is GroupEntry<P> {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "kind" in entry &&
    (entry as GroupEntry<P>).kind === "group"
  );
}

// -----------------------------------------------------------------------------

export type HostOverride<P extends BaseItem> = {
  filter?: (item: P) => boolean;
  getGroup?: (item: P) => string | null;
  subId?: string;
};

export type UseAreaResult<P extends BaseItem> = {
  items: P[];
  entries: (P | SpacerItem)[];
  hiddenItems: P[];
  editMode: boolean;
  DndWrapper: ComponentType<{ children: ReactNode }>;
  ReorderItem: ComponentType<{ item: P | SpacerItem; children: ReactNode }>;
  groupedEntries: TopLevelEntry<P>[];
  GroupBox: ComponentType<{ group: ReorderGroup; children: ReactNode }>;
};

// --- Area context (shared between DndWrapper, ReorderItem, RestoreButton) ---

type InsertionIndicator = {
  itemId: string;
  position: "before" | "after";
} | null;

type GroupingIndicator = {
  targetId: string;
} | null;

type ReorderAreaCtxValue = {
  storageId: string;
  hiddenItems: BaseItem[];
  getLabel: (item: BaseItem) => string;
  insertionIndicator: InsertionIndicator;
  groupingIndicator: GroupingIndicator;
  addSpacer: () => void;
  addGroup: (() => void) | null;
  dragInProgress: boolean;
  enableGroups: boolean;
};
const ReorderAreaContext = createContext<ReorderAreaCtxValue | null>(null);

// ---------------------------------------------------------------------------

const warnedSlots = new Set<string>();

export function useArea<P extends BaseItem>(
  slot: ReorderableSlot<P>,
  override?: HostOverride<P>,
): UseAreaResult<P> {
  const slotCfg = lookupReorderConfig(slot.id) as ReorderConfig<P> | undefined;
  if (!slotCfg && !warnedSlots.has(slot.id)) {
    warnedSlots.add(slot.id);
    console.warn(
      `[reorder] useArea("${slot.id}") was called but the slot was never wrapped with Reorder.area. ` +
        `Wrap the slot in its owning plugin's slots.ts to register grouping.`,
    );
  }
  const editMode = useEditMode();
  const getGroup = override?.getGroup ?? slotCfg?.getGroup;
  const filter = override?.filter;
  const storageId = override?.subId ? `${slot.id}:${override.subId}` : slot.id;
  const enableGroups = slotCfg?.enableGroups ?? false;

  const slotGetLabel = slotCfg?.getLabel as
    | ((item: P) => string)
    | undefined;
  const effectiveGetLabel = useCallback(
    (item: BaseItem): string =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      slotGetLabel?.(item as P) ??
      (item as Record<string, unknown>)._pluginName as string ??
      item.id,
    [slotGetLabel],
  );

  const raw = slot.useContributions();
  const { data: rankMap } = useResource(reorderPrefsResource, {
    slotId: storageId,
  });
  const { data: groupsData } = useResource(reorderGroupsResource, {
    slotId: storageId,
  });

  const { items, entries, hiddenItems, membershipMap } = useMemo(() => {
    const filtered = filter ? raw.filter(filter) : raw;

    const visible: (P | SpacerItem)[] = [];
    const hidden: P[] = [];
    for (const item of filtered) {
      if (rankMap[itemKey(item)]?.hidden && !item.excludeFromReorder) {
        hidden.push(item);
      } else {
        visible.push(item);
      }
    }

    // Inject spacer items from rankMap
    for (const key of Object.keys(rankMap)) {
      if (key.startsWith(SPACER_PREFIX) && rankMap[key]?.rank) {
        visible.push({ id: key, _spacer: true as const });
      }
    }

    // Group order is fixed by natural-order discovery (first appearance).
    const groupOrder: string[] = [];
    const groupOf = (it: P | SpacerItem): string =>
      isSpacer(it) ? "" : getGroup ? (getGroup(it) ?? "") : "";
    for (const it of visible) {
      const g = groupOf(it);
      if (!groupOrder.includes(g)) groupOrder.push(g);
    }

    const sorted = visible
      .map((item, naturalIdx) => ({
        item,
        naturalIdx: isSpacer(item) ? Infinity : naturalIdx,
      }))
      .sort((a, b) => {
        const ga = groupOrder.indexOf(groupOf(a.item));
        const gb = groupOrder.indexOf(groupOf(b.item));
        if (ga !== gb) return ga - gb;
        const ax = isSpacer(a.item) ? false : !!a.item.excludeFromReorder;
        const bx = isSpacer(b.item) ? false : !!b.item.excludeFromReorder;
        if (ax !== bx) return ax ? 1 : -1;
        if (ax && bx) return a.naturalIdx - b.naturalIdx;
        const ar = rankMap[itemKey(a.item)]?.rank ?? null;
        const br = rankMap[itemKey(b.item)]?.rank ?? null;
        if (ar && br) return Rank.compare(ar, br);
        if (ar) return -1;
        if (br) return 1;
        return a.naturalIdx - b.naturalIdx;
      })
      .map((row) => row.item);

    // Build membership map from groups data
    const mMap = new Map<string, { groupId: string; rank: Rank }>();
    if (groupsData) {
      for (const m of groupsData.members) {
        mMap.set(m.contributionId, { groupId: m.groupId, rank: m.rank });
      }
    }

    const entries = sorted;
    const items = sorted.filter((x): x is P => !isSpacer(x));
    return { items, entries, hiddenItems: hidden, membershipMap: mMap };
  }, [raw, rankMap, filter, getGroup, groupsData]);

  // Compute groupedEntries: groups and ungrouped items interleaved by rank
  const groupedEntries = useMemo((): TopLevelEntry<P>[] => {
    if (!enableGroups || !groupsData || groupsData.groups.length === 0) {
      return entries as TopLevelEntry<P>[];
    }

    // Collect group members from the visible entries
    const groupMembersMap = new Map<string, (P | SpacerItem)[]>();
    for (const g of groupsData.groups) {
      groupMembersMap.set(g.id, []);
    }

    const ungrouped: (P | SpacerItem)[] = [];
    for (const item of entries) {
      if (!isSpacer(item) && item.excludeFromReorder) {
        ungrouped.push(item);
        continue;
      }
      const membership = membershipMap.get(itemKey(item));
      if (membership && groupMembersMap.has(membership.groupId)) {
        groupMembersMap.get(membership.groupId)!.push(item);
      } else {
        ungrouped.push(item);
      }
    }

    // Sort members within each group by member rank
    for (const [, members] of groupMembersMap) {
      members.sort((a, b) => {
        const aM = membershipMap.get(itemKey(a));
        const bM = membershipMap.get(itemKey(b));
        if (aM && bM) return Rank.compare(aM.rank, bM.rank);
        return 0;
      });
    }

    // Build interleaved top-level list
    type Ranked = { rank: Rank | null; naturalIdx: number; entry: TopLevelEntry<P> };
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
      const r = rankMap?.[itemKey(item)]?.rank ?? null;
      topLevel.push({ rank: r, naturalIdx: i, entry: item });
    }

    topLevel.sort((a, b) => {
      // excludeFromReorder items always go last
      const aExcl =
        !isGroupEntry(a.entry) && !isSpacer(a.entry) && !!a.entry.excludeFromReorder;
      const bExcl =
        !isGroupEntry(b.entry) && !isSpacer(b.entry) && !!b.entry.excludeFromReorder;
      if (aExcl !== bExcl) return aExcl ? 1 : -1;
      if (a.rank && b.rank) return Rank.compare(a.rank, b.rank);
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.naturalIdx - b.naturalIdx;
    });

    return topLevel.map((t) => t.entry);
  }, [entries, groupsData, membershipMap, rankMap, enableGroups]);

  const itemsRef = useRef<(P | SpacerItem)[]>(entries);
  itemsRef.current = entries;
  const rankMapRef = useRef(rankMap);
  rankMapRef.current = rankMap;
  const getGroupRef = useRef(getGroup);
  getGroupRef.current = getGroup;
  const hiddenItemsRef = useRef<P[]>(hiddenItems);
  hiddenItemsRef.current = hiddenItems;
  const getLabelRef = useRef(effectiveGetLabel);
  getLabelRef.current = effectiveGetLabel;
  const storageIdRef = useRef(storageId);
  storageIdRef.current = storageId;
  const membershipMapRef = useRef(membershipMap);
  membershipMapRef.current = membershipMap;
  const groupsDataRef = useRef(groupsData);
  groupsDataRef.current = groupsData;
  const groupedEntriesRef = useRef(groupedEntries);
  groupedEntriesRef.current = groupedEntries;

  const onDrop = useCallback(
    (draggedKey: string, overKey: string) => {
      if (draggedKey === overKey) return;
      const list = itemsRef.current;
      const draggedIdx = list.findIndex((x) => itemKey(x) === draggedKey);
      const overIdx = list.findIndex((x) => itemKey(x) === overKey);
      if (draggedIdx < 0 || overIdx < 0) return;

      const dragged = list[draggedIdx]!;
      const target = list[overIdx]!;
      const draggedExcluded = isSpacer(dragged)
        ? false
        : !!dragged.excludeFromReorder;
      const targetExcluded = isSpacer(target)
        ? false
        : !!target.excludeFromReorder;
      if (draggedExcluded || targetExcluded) return;

      const gg = getGroupRef.current;
      const groupValue = gg && !isSpacer(dragged) ? gg(dragged) : null;
      if (gg && !isSpacer(target) && gg(target) !== groupValue) return;

      const siblings = list.filter((x) => {
        if (itemKey(x) === draggedKey) return false;
        if (isSpacer(x)) return true;
        if (x.excludeFromReorder) return false;
        if (!gg) return true;
        return gg(x) === groupValue;
      });
      const tIdx = siblings.findIndex((x) => itemKey(x) === overKey);
      if (tIdx < 0) return;

      const movingDown = draggedIdx < overIdx;
      const prev = movingDown ? siblings[tIdx]! : (siblings[tIdx - 1] ?? null);
      const next = movingDown ? (siblings[tIdx + 1] ?? null) : siblings[tIdx]!;

      const rm = rankMapRef.current;
      const prevRank = prev ? (rm[itemKey(prev)]?.rank ?? null) : null;
      const nextRank = next ? (rm[itemKey(next)]?.rank ?? null) : null;

      let newRank: Rank;
      try {
        newRank = Rank.between(prevRank, nextRank);
      } catch {
        return;
      }

      // If item was in a group, remove it first
      const membership = membershipMapRef.current.get(draggedKey);
      if (membership) {
        void fetch(
          `/api/reorder/${storageIdRef.current}/groups/members/${draggedKey}`,
          { method: "DELETE" },
        );
      }

      void fetch(`/api/reorder/${storageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributionId: draggedKey, rank: newRank }),
      });
    },
    [storageId],
  );

  const onGroupCreate = useCallback(
    (draggedKey: string, targetKey: string) => {
      const list = itemsRef.current;
      const dragged = list.find((x) => itemKey(x) === draggedKey);
      const target = list.find((x) => itemKey(x) === targetKey);
      if (!dragged || !target) return;
      if (isSpacer(dragged) || isSpacer(target)) return;
      if (dragged.excludeFromReorder || target.excludeFromReorder) return;

      // Static group constraint
      const gg = getGroupRef.current;
      if (gg && gg(dragged) !== gg(target)) return;

      // Check if target is already in a group → join that group
      const targetMembership = membershipMapRef.current.get(targetKey);
      if (targetMembership) {
        void fetch(`/api/reorder/groups/${targetMembership.groupId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId: storageIdRef.current,
            contributionIds: [draggedKey],
          }),
        });
        return;
      }

      // Create a new group with both items
      void fetch(`/api/reorder/${storageIdRef.current}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributionIds: [targetKey, draggedKey] }),
      });
    },
    [],
  );

  const onGroupJoin = useCallback(
    (draggedKey: string, groupId: string) => {
      const list = itemsRef.current;
      const dragged = list.find((x) => itemKey(x) === draggedKey);
      if (!dragged || isSpacer(dragged) || dragged.excludeFromReorder) return;

      // Static group constraint: check first member of group
      const gg = getGroupRef.current;
      if (gg) {
        const gd = groupsDataRef.current;
        if (gd) {
          const firstMemberId = gd.members.find(
            (m) => m.groupId === groupId,
          )?.contributionId;
          if (firstMemberId) {
            const firstMember = list.find((x) => itemKey(x) === firstMemberId);
            if (firstMember && !isSpacer(firstMember)) {
              if (gg(dragged) !== gg(firstMember)) return;
            }
          }
        }
      }

      void fetch(`/api/reorder/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: storageIdRef.current,
          contributionIds: [draggedKey],
        }),
      });
    },
    [],
  );

  const onGroupReorder = useCallback(
    (groupId: string, overData: Record<string, unknown>) => {
      const gd = groupsDataRef.current;
      if (!gd) return;

      // Find the group being dragged
      const groups = gd.groups;
      const draggedIdx = groups.findIndex((g) => g.id === groupId);
      if (draggedIdx < 0) return;

      // For group reorder, we need to find the target in groupedEntries
      const ge = groupedEntriesRef.current;
      const zone = overData.zone as string | undefined;
      const targetId = overData.targetId as string | undefined;
      const targetGroupId = overData.groupId as string | undefined;

      let prevRank: Rank | null = null;
      let nextRank: Rank | null = null;

      if (zone === "before" || zone === "after") {
        // Dropped before/after a specific item or group in the top-level list
        const topLevelIdx = ge.findIndex((e) => {
          if (isGroupEntry(e)) return e.group.id === targetId;
          return itemKey(e) === targetId;
        });
        if (topLevelIdx < 0) return;

        if (zone === "before") {
          const prev = topLevelIdx > 0 ? ge[topLevelIdx - 1] : null;
          const next = ge[topLevelIdx];
          prevRank = prev
            ? isGroupEntry(prev)
              ? prev.group.rank
              : (rankMapRef.current?.[itemKey(prev)]?.rank ?? null)
            : null;
          nextRank = next
            ? isGroupEntry(next)
              ? next.group.rank
              : (rankMapRef.current?.[itemKey(next)]?.rank ?? null)
            : null;
        } else {
          const prev = ge[topLevelIdx];
          const next =
            topLevelIdx + 1 < ge.length ? ge[topLevelIdx + 1] : null;
          prevRank = prev
            ? isGroupEntry(prev)
              ? prev.group.rank
              : (rankMapRef.current?.[itemKey(prev)]?.rank ?? null)
            : null;
          nextRank = next
            ? isGroupEntry(next)
              ? next.group.rank
              : (rankMapRef.current?.[itemKey(next)]?.rank ?? null)
            : null;
        }
      } else if (targetGroupId) {
        // Dropped on a group-join zone — treat as "after that group"
        const targetGroup = groups.find((g) => g.id === targetGroupId);
        if (!targetGroup || targetGroup.id === groupId) return;
        prevRank = targetGroup.rank;
        const gIdx = groups.indexOf(targetGroup);
        const nextGroup = groups[gIdx + 1];
        nextRank = nextGroup ? nextGroup.rank : null;
      }

      let newRank: Rank;
      try {
        newRank = Rank.between(prevRank, nextRank);
      } catch {
        return;
      }

      void fetch(`/api/reorder/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: storageIdRef.current, rank: newRank }),
      });
    },
    [],
  );

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const onGroupCreateRef = useRef(onGroupCreate);
  onGroupCreateRef.current = onGroupCreate;
  const onGroupJoinRef = useRef(onGroupJoin);
  onGroupJoinRef.current = onGroupJoin;
  const onGroupReorderRef = useRef(onGroupReorder);
  onGroupReorderRef.current = onGroupReorder;

  const enableGroupsRef = useRef(enableGroups);
  enableGroupsRef.current = enableGroups;

  const DndWrapper = useMemo(
    () =>
      function DndWrapperBound({ children }: { children: ReactNode }) {
        const em = useEditMode();
        const sensors = useSensors(
          useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        );
        const [activeId, setActiveId] = useState<string | null>(null);
        const [overId, setOverId] = useState<string | null>(null);
        const [overData, setOverData] = useState<Record<string, unknown>>({});

        let insertionIndicator: InsertionIndicator = null;
        let groupingIndicator: GroupingIndicator = null;

        if (activeId && overId && activeId !== overId) {
          const zone = overData.zone as string | undefined;

          if (enableGroupsRef.current && zone) {
            // Three-zone mode
            if (zone === "before") {
              insertionIndicator = {
                itemId: overData.targetId as string,
                position: "before",
              };
            } else if (zone === "after") {
              insertionIndicator = {
                itemId: overData.targetId as string,
                position: "after",
              };
            } else if (zone === "child") {
              groupingIndicator = { targetId: overData.targetId as string };
            }
            // group-join is handled by GroupBox's own isOver
          } else {
            // Single-zone mode (legacy)
            const list = itemsRef.current;
            const overPlainId = stripPrefix(DROP_PREFIX, overId);
            const draggedIdx = list.findIndex((x) => itemKey(x) === activeId);
            const overIdx = list.findIndex((x) => itemKey(x) === overPlainId);
            if (draggedIdx >= 0 && overIdx >= 0) {
              insertionIndicator = {
                itemId: overPlainId,
                position: draggedIdx < overIdx ? "after" : "before",
              };
            }
          }
        }

        function addSpacer() {
          const sid = storageIdRef.current;
          const rm = rankMapRef.current;
          const items = itemsRef.current;
          const patch = (contributionId: string, rank: Rank) =>
            void fetch(`/api/reorder/${sid}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contributionId, rank: String(rank) }),
            });

          let prevR: Rank | null = null;
          for (const item of items) {
            if (isSpacer(item)) continue;
            const existing = rm[itemKey(item)]?.rank ?? null;
            if (existing) {
              prevR = existing;
            } else {
              const newR = Rank.between(prevR, null);
              prevR = newR;
              patch(itemKey(item), newR);
            }
          }

          const spacerRank = Rank.between(prevR, null);
          patch(`${SPACER_PREFIX}${crypto.randomUUID()}`, spacerRank);
        }

        function addGroup() {
          void fetch(`/api/reorder/${storageIdRef.current}/groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        }

        const ctxValue: ReorderAreaCtxValue = {
          storageId: storageIdRef.current,
          hiddenItems: hiddenItemsRef.current,
          getLabel: getLabelRef.current,
          insertionIndicator,
          groupingIndicator,
          addSpacer,
          addGroup: enableGroupsRef.current ? addGroup : null,
          dragInProgress: activeId !== null,
          enableGroups: enableGroupsRef.current,
        };
        return (
          <ReorderAreaContext.Provider value={ctxValue}>
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={(e) => {
                const id = String(e.active.id);
                if (id.startsWith(DRAG_GROUP_PREFIX)) {
                  setActiveId(id);
                } else {
                  setActiveId(stripPrefix(DRAG_PREFIX, id));
                }
              }}
              onDragOver={(e) => {
                if (e.over) {
                  setOverId(String(e.over.id));
                  setOverData(
                    (e.over.data.current as Record<string, unknown>) ?? {},
                  );
                } else {
                  setOverId(null);
                  setOverData({});
                }
              }}
              onDragEnd={(e: DragEndEvent) => {
                const activeIdStr = String(e.active.id);
                const dropData =
                  (e.over?.data.current as Record<string, unknown>) ?? {};
                const zone = dropData.zone as string | undefined;

                if (activeIdStr.startsWith(DRAG_GROUP_PREFIX)) {
                  // Group drag
                  const groupId = activeIdStr.slice(DRAG_GROUP_PREFIX.length);
                  if (e.over) {
                    onGroupReorderRef.current(groupId, dropData);
                  }
                } else {
                  // Item drag
                  const draggedKey = stripPrefix(DRAG_PREFIX, activeIdStr);

                  if (enableGroupsRef.current && zone) {
                    // Three-zone dispatch
                    if (
                      zone === "before" ||
                      zone === "after"
                    ) {
                      const targetId = dropData.targetId as string;
                      if (targetId) onDropRef.current(draggedKey, targetId);
                    } else if (zone === "child") {
                      const targetId = dropData.targetId as string;
                      if (targetId)
                        onGroupCreateRef.current(draggedKey, targetId);
                    } else if (zone === "group-join") {
                      const groupId = dropData.groupId as string;
                      if (groupId)
                        onGroupJoinRef.current(draggedKey, groupId);
                    }
                  } else {
                    // Single-zone dispatch (legacy)
                    const overKey = e.over
                      ? stripPrefix(DROP_PREFIX, String(e.over.id))
                      : null;
                    if (overKey) onDropRef.current(draggedKey, overKey);
                  }
                }

                setActiveId(null);
                setOverId(null);
                setOverData({});
              }}
              onDragCancel={() => {
                setActiveId(null);
                setOverId(null);
                setOverData({});
              }}
            >
              {children}
              {em && <RestoreButton />}
            </DndContext>
          </ReorderAreaContext.Provider>
        );
      },
    [],
  );

  const GroupBoxBound = useMemo(
    () =>
      function GroupBoxBound({
        group,
        children,
      }: {
        group: ReorderGroup;
        children: ReactNode;
      }) {
        const ctx = useContext(ReorderAreaContext);
        const editMode = useEditMode();
        if (!ctx) return <>{children}</>;
        return (
          <ReorderGroupBox
            group={group}
            storageId={ctx.storageId}
            editMode={editMode}
            dragInProgress={ctx.dragInProgress}
            children={children}
          />
        );
      },
    [],
  );

  return {
    items,
    entries,
    hiddenItems,
    editMode,
    DndWrapper,
    ReorderItem: ReorderItem as ComponentType<{
      item: P | SpacerItem;
      children: ReactNode;
    }>,
    groupedEntries,
    GroupBox: GroupBoxBound as ComponentType<{
      group: ReorderGroup;
      children: ReactNode;
    }>,
  };
}

const DRAG_PREFIX = "reorder-drag-";
const DRAG_GROUP_PREFIX = "reorder-drag-group-";
const DROP_PREFIX = "reorder-drop-";
const stripPrefix = (prefix: string, s: string) =>
  s.startsWith(prefix) ? s.slice(prefix.length) : s;

function ReorderItem({
  item,
  children,
}: {
  item: BaseItem | SpacerItem;
  children: ReactNode;
}) {
  const editMode = useEditMode();
  if (isSpacer(item)) {
    return <SpacerReorderItem item={item} editMode={editMode} />;
  }
  if (!editMode || item.excludeFromReorder) {
    return <>{children}</>;
  }
  return <ReorderItemActive item={item}>{children}</ReorderItemActive>;
}

function ReorderItemActive({
  item,
  children,
}: {
  item: BaseItem;
  children: ReactNode;
}) {
  const ctx = useContext(ReorderAreaContext);

  if (ctx?.enableGroups) {
    return (
      <ReorderItemThreeZone item={item}>{children}</ReorderItemThreeZone>
    );
  }

  return (
    <ReorderItemSingleZone item={item} ctx={ctx}>
      {children}
    </ReorderItemSingleZone>
  );
}

function ReorderItemSingleZone({
  item,
  ctx,
  children,
}: {
  item: BaseItem;
  ctx: ReorderAreaCtxValue | null;
  children: ReactNode;
}) {
  const key = itemKey(item);
  const draggable = useDraggable({ id: `${DRAG_PREFIX}${key}` });
  const droppable = useDroppable({ id: `${DROP_PREFIX}${key}` });

  const transform = draggable.transform;
  const isDragging = draggable.isDragging;

  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : {
        touchAction: "none",
      };

  function handleHide(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ctx) return;
    void fetch(`/api/reorder/${ctx.storageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId: key, hidden: true }),
    });
  }

  const indicator = ctx?.insertionIndicator;
  const showBefore =
    indicator?.itemId === key && indicator.position === "before";
  const showAfter =
    indicator?.itemId === key && indicator.position === "after";

  return (
    <>
      {showBefore && <div className="reorder-drop-indicator" />}
      <div
        ref={(node) => {
          draggable.setNodeRef(node);
          droppable.setNodeRef(node);
        }}
        {...draggable.attributes}
        {...draggable.listeners}
        style={style}
        className={[
          "group relative cursor-grab rounded-md ring-1 ring-primary/50",
          isDragging && "opacity-40",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none cursor-pointer opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleHide}
          aria-label={`Hide ${item.id}`}
        >
          <MdClose className="size-2.5" />
        </button>
        <div className="pointer-events-none">{children}</div>
      </div>
      {showAfter && <div className="reorder-drop-indicator" />}
    </>
  );
}

function ReorderItemThreeZone({
  item,
  children,
}: {
  item: BaseItem;
  children: ReactNode;
}) {
  const ctx = useContext(ReorderAreaContext);
  const key = itemKey(item);
  const draggable = useDraggable({ id: `${DRAG_PREFIX}${key}` });

  const beforeDroppable = useDroppable({
    id: `reorder-drop-before-${key}`,
    data: { zone: "before", targetId: key },
  });
  const afterDroppable = useDroppable({
    id: `reorder-drop-after-${key}`,
    data: { zone: "after", targetId: key },
  });
  const childDroppable = useDroppable({
    id: `reorder-drop-child-${key}`,
    data: { zone: "child", targetId: key },
  });

  const transform = draggable.transform;
  const isDragging = draggable.isDragging;

  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : {
        touchAction: "none",
      };

  function handleHide(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ctx) return;
    void fetch(`/api/reorder/${ctx.storageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId: key, hidden: true }),
    });
  }

  const isGroupTarget = ctx?.groupingIndicator?.targetId === key;
  const showBefore =
    ctx?.insertionIndicator?.itemId === key &&
    ctx.insertionIndicator.position === "before";
  const showAfter =
    ctx?.insertionIndicator?.itemId === key &&
    ctx.insertionIndicator.position === "after";

  return (
    <>
      {showBefore && <div className="reorder-drop-indicator" />}
      <div
        ref={draggable.setNodeRef}
        {...draggable.attributes}
        {...draggable.listeners}
        style={style}
        className="group/reorder-item relative"
      >
        <div
          ref={childDroppable.setNodeRef}
          className={[
            "relative cursor-grab rounded-md ring-1 ring-primary/50",
            isDragging && "opacity-40",
            isGroupTarget && "ring-2 ring-primary bg-accent/30",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button
            className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none cursor-pointer opacity-0 group-hover/reorder-item:opacity-80 hover:!opacity-100 transition-opacity"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleHide}
            aria-label={`Hide ${item.id}`}
          >
            <MdClose className="size-2.5" />
          </button>
          <div className="pointer-events-none">{children}</div>
        </div>
        <div
          ref={beforeDroppable.setNodeRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-[8px]"
        />
        <div
          ref={afterDroppable.setNodeRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[8px]"
        />
      </div>
      {showAfter && <div className="reorder-drop-indicator" />}
    </>
  );
}

function SpacerReorderItem({
  item,
  editMode,
}: {
  item: SpacerItem;
  editMode: boolean;
}) {
  const ctx = useContext(ReorderAreaContext);
  const key = itemKey(item);
  const draggable = useDraggable({ id: `${DRAG_PREFIX}${key}` });
  const droppable = useDroppable({ id: `${DROP_PREFIX}${key}` });

  if (!editMode) {
    return (
      <div
        ref={(node) => {
          droppable.setNodeRef(node);
        }}
        className="flex-1"
      />
    );
  }

  const transform = draggable.transform;
  const isDragging = draggable.isDragging;
  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : { touchAction: "none" };

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ctx) return;
    void fetch(`/api/reorder/${ctx.storageId}/${key}`, {
      method: "DELETE",
    });
  }

  const indicator = ctx?.insertionIndicator;
  const showBefore =
    indicator?.itemId === key && indicator.position === "before";
  const showAfter =
    indicator?.itemId === key && indicator.position === "after";

  return (
    <>
      {showBefore && <div className="reorder-drop-indicator" />}
      <div
        ref={(node) => {
          draggable.setNodeRef(node);
          droppable.setNodeRef(node);
        }}
        {...draggable.attributes}
        {...draggable.listeners}
        style={style}
        className={[
          "group relative flex h-7 min-w-8 flex-1 cursor-grab items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-2",
          isDragging && "opacity-40",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="text-[10px] text-muted-foreground/60 select-none">
          ⇔
        </span>
        <button
          className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none cursor-pointer opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          aria-label="Remove spacer"
        >
          <MdClose className="size-2.5" />
        </button>
      </div>
      {showAfter && <div className="reorder-drop-indicator" />}
    </>
  );
}

function RestoreButton() {
  const ctx = useContext(ReorderAreaContext)!;
  const [open, setOpen] = useState(false);
  const hasHidden = ctx.hiddenItems.length > 0;

  function handleRestore(contributionId: string) {
    void fetch(`/api/reorder/${ctx.storageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId, hidden: false }),
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 px-2.5 text-xs text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label="Add items"
      >
        <MdAdd className="size-3.5" />
        {hasHidden
          ? ctx.hiddenItems.length === 1
            ? "1 hidden"
            : `${ctx.hiddenItems.length} hidden`
          : "Add"}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        {hasHidden && (
          <div className="p-1">
            {ctx.hiddenItems.map((item) => (
              <button
                key={itemKey(item)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  handleRestore(itemKey(item));
                  if (ctx.hiddenItems.length <= 1) setOpen(false);
                }}
              >
                <MdAdd className="size-3.5 shrink-0 text-muted-foreground" />
                {ctx.getLabel(item)}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border p-1">
          {ctx.addGroup && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                ctx.addGroup!();
                setOpen(false);
              }}
            >
              <MdAdd className="size-3.5 shrink-0 text-muted-foreground" />
              Add Group
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              ctx.addSpacer();
              setOpen(false);
            }}
          >
            <MdAdd className="size-3.5 shrink-0 text-muted-foreground" />
            Add Spacer
          </button>
        </div>

        <div className="border-t border-border px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <MdStorefront className="size-3.5" />
            Marketplace
          </div>
          <div className="relative">
            <MdSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search..."
              className="h-7 pl-7 text-xs"
              disabled
            />
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground/60">
            No items
          </p>
        </div>

        <div className="border-t border-border p-1">
          <button
            disabled
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed"
          >
            <MdAdd className="size-3.5 shrink-0" />
            Create custom plugin
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
