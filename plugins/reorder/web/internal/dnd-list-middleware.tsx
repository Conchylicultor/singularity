import { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Contribution } from "@core";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { RenderSlotSubIdContext } from "@plugins/primitives/plugins/slot-render/web";
import { reorderGroupsResource } from "@plugins/reorder/plugins/groups/core";
import { reorderPrefsResource } from "../../shared/resource";
import { useEditMode } from "./edit-mode-store";
import { ReorderGroupBox } from "./group-box";
import {
  computeReorderState,
  contributionKey,
  contributionLabel,
  entryKey,
  isGroupEntry,
  isSpacer,
  SPACER_PREFIX,
} from "./sorting";
import {
  DRAG_GROUP_PREFIX,
  DRAG_PREFIX,
  RestoreButton,
  SpacerReorderItem,
  stripPrefix,
  type InsertionIndicator,
  type GroupingIndicator,
  ReorderAreaContext,
  type ReorderAreaCtxValue,
} from "./dnd-components";

export function ReorderListMiddleware({
  slotId,
  contributions,
  renderItem,
}: {
  slotId: string;
  contributions: Contribution[];
  renderItem: (contribution: Contribution) => ReactNode;
  children: ReactNode;
}) {
  return (
    <ReorderListMiddlewareInner
      slotId={slotId}
      contributions={contributions}
      renderItem={renderItem}
    />
  );
}

function ReorderListMiddlewareInner({
  slotId,
  contributions,
  renderItem,
}: {
  slotId: string;
  contributions: Contribution[];
  renderItem: (contribution: Contribution) => ReactNode;
}) {
  const subId = useContext(RenderSlotSubIdContext);
  const storageId = subId ? `${slotId}:${subId}` : slotId;
  const editMode = useEditMode();

  const { data: rankMap } = useResource(reorderPrefsResource, {
    slotId: storageId,
  });
  const { data: groupsData } = useResource(reorderGroupsResource, {
    slotId: storageId,
  });

  const state = useMemo(
    () => computeReorderState(contributions, rankMap, groupsData),
    [contributions, rankMap, groupsData],
  );

  const hiddenItems = useMemo(
    () =>
      state.hidden.map((c) => ({
        key: contributionKey(c)!,
        label: contributionLabel(c),
      })),
    [state.hidden],
  );

  // --- Refs for drag handlers ------------------------------------------------

  const entriesRef = useRef(state.entries);
  entriesRef.current = state.entries;
  const rankMapRef = useRef(rankMap);
  rankMapRef.current = rankMap;
  const membershipMapRef = useRef(state.membershipMap);
  membershipMapRef.current = state.membershipMap;
  const groupsDataRef = useRef(groupsData);
  groupsDataRef.current = groupsData;
  const groupedEntriesRef = useRef(state.groupedEntries);
  groupedEntriesRef.current = state.groupedEntries;

  // --- Drag handlers ---------------------------------------------------------

  const onDrop = useCallback(
    (draggedKey: string, overKey: string) => {
      if (draggedKey === overKey) return;
      const list = entriesRef.current;
      const draggedIdx = list.findIndex((x) => entryKey(x) === draggedKey);
      const overIdx = list.findIndex((x) => entryKey(x) === overKey);
      if (draggedIdx < 0 || overIdx < 0) return;

      const dragged = list[draggedIdx]!;
      const target = list[overIdx]!;
      if (
        !isSpacer(dragged) &&
        (dragged as Record<string, unknown>).excludeFromReorder
      )
        return;
      if (
        !isSpacer(target) &&
        (target as Record<string, unknown>).excludeFromReorder
      )
        return;

      const siblings = list.filter((x) => {
        if (entryKey(x) === draggedKey) return false;
        if (isSpacer(x)) return true;
        if ((x as Record<string, unknown>).excludeFromReorder) return false;
        return true;
      });
      const tIdx = siblings.findIndex((x) => entryKey(x) === overKey);
      if (tIdx < 0) return;

      const movingDown = draggedIdx < overIdx;
      const prev = movingDown ? siblings[tIdx]! : (siblings[tIdx - 1] ?? null);
      const next = movingDown ? (siblings[tIdx + 1] ?? null) : siblings[tIdx]!;

      const rm = rankMapRef.current;
      const prevRank = prev ? (rm[entryKey(prev)]?.rank ?? null) : null;
      const nextRank = next ? (rm[entryKey(next)]?.rank ?? null) : null;

      let newRank: Rank;
      try {
        newRank = Rank.between(prevRank, nextRank);
      } catch {
        return;
      }

      const membership = membershipMapRef.current.get(draggedKey);
      if (membership) {
        void fetch(
          `/api/reorder/${storageId}/groups/members/${draggedKey}`,
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
      const list = entriesRef.current;
      const dragged = list.find((x) => entryKey(x) === draggedKey);
      const target = list.find((x) => entryKey(x) === targetKey);
      if (!dragged || !target) return;
      if (isSpacer(dragged) || isSpacer(target)) return;
      if ((dragged as Record<string, unknown>).excludeFromReorder) return;
      if ((target as Record<string, unknown>).excludeFromReorder) return;

      const targetMembership = membershipMapRef.current.get(targetKey);
      if (targetMembership) {
        void fetch(
          `/api/reorder/groups/${targetMembership.groupId}/members`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slotId: storageId,
              contributionIds: [draggedKey],
            }),
          },
        );
        return;
      }

      void fetch(`/api/reorder/${storageId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contributionIds: [targetKey, draggedKey],
        }),
      });
    },
    [storageId],
  );

  const onGroupJoin = useCallback(
    (draggedKey: string, groupId: string) => {
      const list = entriesRef.current;
      const dragged = list.find((x) => entryKey(x) === draggedKey);
      if (!dragged || isSpacer(dragged)) return;
      if ((dragged as Record<string, unknown>).excludeFromReorder) return;

      void fetch(`/api/reorder/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: storageId,
          contributionIds: [draggedKey],
        }),
      });
    },
    [storageId],
  );

  const onGroupReorder = useCallback(
    (groupId: string, overData: Record<string, unknown>) => {
      const gd = groupsDataRef.current;
      if (!gd) return;
      if (gd.groups.findIndex((g) => g.id === groupId) < 0) return;

      const ge = groupedEntriesRef.current;
      const zone = overData.zone as string | undefined;
      const targetId = overData.targetId as string | undefined;
      const targetGroupId = overData.groupId as string | undefined;

      let prevRank: Rank | null = null;
      let nextRank: Rank | null = null;

      if (zone === "before" || zone === "after") {
        const topLevelIdx = ge.findIndex((e) => {
          if (isGroupEntry(e)) return e.group.id === targetId;
          return entryKey(e) === targetId;
        });
        if (topLevelIdx < 0) return;

        if (zone === "before") {
          const prev = topLevelIdx > 0 ? ge[topLevelIdx - 1] : null;
          const next = ge[topLevelIdx];
          prevRank = prev
            ? isGroupEntry(prev)
              ? prev.group.rank
              : (rankMapRef.current?.[entryKey(prev)]?.rank ?? null)
            : null;
          nextRank = next
            ? isGroupEntry(next)
              ? next.group.rank
              : (rankMapRef.current?.[entryKey(next)]?.rank ?? null)
            : null;
        } else {
          const prev = ge[topLevelIdx];
          const next =
            topLevelIdx + 1 < ge.length ? ge[topLevelIdx + 1] : null;
          prevRank = prev
            ? isGroupEntry(prev)
              ? prev.group.rank
              : (rankMapRef.current?.[entryKey(prev)]?.rank ?? null)
            : null;
          nextRank = next
            ? isGroupEntry(next)
              ? next.group.rank
              : (rankMapRef.current?.[entryKey(next)]?.rank ?? null)
            : null;
        }
      } else if (targetGroupId) {
        const groups = gd.groups;
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
        body: JSON.stringify({ slotId: storageId, rank: newRank }),
      });
    },
    [storageId],
  );

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const onGroupCreateRef = useRef(onGroupCreate);
  onGroupCreateRef.current = onGroupCreate;
  const onGroupJoinRef = useRef(onGroupJoin);
  onGroupJoinRef.current = onGroupJoin;
  const onGroupReorderRef = useRef(onGroupReorder);
  onGroupReorderRef.current = onGroupReorder;

  // --- DndContext rendering --------------------------------------------------

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

    if (zone) {
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
    }
  }

  function addSpacer() {
    const rm = rankMapRef.current;
    const items = entriesRef.current;
    const patch = (cId: string, rank: Rank) =>
      void fetch(`/api/reorder/${storageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributionId: cId, rank: String(rank) }),
      });

    let prevR: Rank | null = null;
    for (const item of items) {
      if (isSpacer(item)) continue;
      const existing = rm[entryKey(item)]?.rank ?? null;
      if (existing) {
        prevR = existing;
      } else {
        const newR = Rank.between(prevR, null);
        prevR = newR;
        patch(entryKey(item), newR);
      }
    }

    const spacerRank = Rank.between(prevR, null);
    patch(`${SPACER_PREFIX}${crypto.randomUUID()}`, spacerRank);
  }

  function addGroup() {
    void fetch(`/api/reorder/${storageId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  const ctxValue: ReorderAreaCtxValue = {
    storageId,
    hiddenItems,
    insertionIndicator,
    groupingIndicator,
    addSpacer,
    addGroup,
    dragInProgress: activeId !== null,
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
            const gId = activeIdStr.slice(DRAG_GROUP_PREFIX.length);
            if (e.over) {
              onGroupReorderRef.current(gId, dropData);
            }
          } else {
            const draggedKey = stripPrefix(DRAG_PREFIX, activeIdStr);

            if (zone) {
              if (zone === "before" || zone === "after") {
                const tId = dropData.targetId as string;
                if (tId) onDropRef.current(draggedKey, tId);
              } else if (zone === "child") {
                const tId = dropData.targetId as string;
                if (tId) onGroupCreateRef.current(draggedKey, tId);
              } else if (zone === "group-join") {
                const gId = dropData.groupId as string;
                if (gId) onGroupJoinRef.current(draggedKey, gId);
              }
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
        {state.groupedEntries.map((entry) => {
          if (isGroupEntry(entry)) {
            return (
              <ReorderGroupBox
                key={entry.group.id}
                group={entry.group}
                storageId={storageId}
                editMode={editMode}
                dragInProgress={activeId !== null}
              >
                {entry.members.map((member) => {
                  if (isSpacer(member)) {
                    return (
                      <SpacerReorderItem
                        key={member.id}
                        itemKey={member.id}
                        storageId={storageId}
                        insertionIndicator={insertionIndicator}
                      />
                    );
                  }
                  return renderItem(member);
                })}
              </ReorderGroupBox>
            );
          }
          if (isSpacer(entry)) {
            return (
              <SpacerReorderItem
                key={entry.id}
                itemKey={entry.id}
                storageId={storageId}
                insertionIndicator={insertionIndicator}
              />
            );
          }
          return renderItem(entry);
        })}
        {editMode && (
          <RestoreButton
            storageId={storageId}
            hiddenItems={hiddenItems}
            addSpacer={addSpacer}
            addGroup={addGroup}
          />
        )}
      </DndContext>
    </ReorderAreaContext.Provider>
  );
}
