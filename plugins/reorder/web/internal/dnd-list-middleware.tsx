import { useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import type { Contribution } from "@core";
import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { RenderSlotSubIdContext } from "@plugins/primitives/plugins/slot-render/web";
import { SortableList } from "@plugins/primitives/plugins/sortable-list/web";
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
  type SpacerItem,
  type TopLevelEntry,
} from "./sorting";
import {
  RestoreButton,
  SpacerReorderItem,
  ReorderAreaContext,
  type ReorderAreaCtxValue,
} from "./dnd-components";

const DRAG_GROUP_PREFIX = "reorder-drag-group-";

const reorderCollisionDetection: CollisionDetection = (args) => {
  const sortableContainers = args.droppableContainers.filter((c) => {
    const id = String(c.id);
    return !id.startsWith("group-zone:") && !id.startsWith("group-join:");
  });
  const sortableHits = closestCenter({
    ...args,
    droppableContainers: sortableContainers,
  });

  const withinHits = pointerWithin(args);
  const zoneHits = withinHits.filter((c) => {
    const zone = (
      c.data?.droppableContainer?.data?.current as Record<string, unknown>
    )?.zone;
    return zone === "child" || zone === "group-join";
  });

  return [...sortableHits, ...zoneHits];
};

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

      const rm = rankMapRef.current;
      const patch = (cId: string, rank: Rank) =>
        void fetch(`/api/reorder/${storageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contributionId: cId, rank: String(rank) }),
        });

      const siblings = list.filter((x) => {
        if (entryKey(x) === draggedKey) return false;
        if (isSpacer(x)) return true;
        if ((x as Record<string, unknown>).excludeFromReorder) return false;
        return true;
      });

      const hasUnranked = siblings.some(
        (x) => !rm[entryKey(x)]?.rank,
      );
      if (hasUnranked) {
        let prevR: Rank | null = null;
        for (const item of siblings) {
          const existing = rm[entryKey(item)]?.rank ?? null;
          if (existing) {
            prevR = existing;
          } else {
            const newR = Rank.between(prevR, null);
            prevR = newR;
            patch(entryKey(item), newR);
            rm[entryKey(item)] = { ...rm[entryKey(item)], rank: newR };
          }
        }
      }

      const tIdx = siblings.findIndex((x) => entryKey(x) === overKey);
      if (tIdx < 0) return;

      const movingDown = draggedIdx < overIdx;
      const prev = movingDown ? siblings[tIdx]! : (siblings[tIdx - 1] ?? null);
      const next = movingDown ? (siblings[tIdx + 1] ?? null) : siblings[tIdx]!;

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

      patch(draggedKey, newRank);
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

  /* eslint-disable @typescript-eslint/no-unnecessary-condition -- ref guards + Record key lookups can be undefined at runtime */
  const onGroupReorder = useCallback(
    (groupId: string, overId: string) => {
      const gd = groupsDataRef.current;
      if (!gd) return;
      if (!gd.groups.some((g) => g.id === groupId)) return;
      if (overId.startsWith("group-zone:")) return;

      const ge = groupedEntriesRef.current;
      const rm = rankMapRef.current;

      const draggedIdx = ge.findIndex(
        (e) => isGroupEntry(e) && e.group.id === groupId,
      );

      let overIdx: number;
      if (overId.startsWith("group-join:")) {
        const tid = overId.slice("group-join:".length);
        overIdx = ge.findIndex((e) => isGroupEntry(e) && e.group.id === tid);
      } else {
        overIdx = ge.findIndex(
          (e) =>
            !isGroupEntry(e) &&
            entryKey(e as Contribution | SpacerItem) === overId,
        );
      }
      if (draggedIdx < 0 || overIdx < 0) return;

      const siblings = ge.filter(
        (e) => !(isGroupEntry(e) && e.group.id === groupId),
      );

      let targetIdx: number;
      if (overId.startsWith("group-join:")) {
        const tid = overId.slice("group-join:".length);
        targetIdx = siblings.findIndex(
          (e) => isGroupEntry(e) && e.group.id === tid,
        );
      } else {
        targetIdx = siblings.findIndex(
          (e) =>
            !isGroupEntry(e) &&
            entryKey(e as Contribution | SpacerItem) === overId,
        );
      }
      if (targetIdx < 0) return;

      const movingDown = draggedIdx < overIdx;
      const prev = movingDown
        ? siblings[targetIdx]
        : (siblings[targetIdx - 1] ?? null);
      const next = movingDown
        ? (siblings[targetIdx + 1] ?? null)
        : siblings[targetIdx];

      const entryRank = (entry: TopLevelEntry | null | undefined): Rank | null => {
        if (!entry) return null;
        if (isGroupEntry(entry)) return entry.group.rank;
        return rm[entryKey(entry as Contribution | SpacerItem)]?.rank ?? null;
      };

      let newRank: Rank;
      try {
        newRank = Rank.between(entryRank(prev), entryRank(next));
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
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const onGroupCreateRef = useRef(onGroupCreate);
  onGroupCreateRef.current = onGroupCreate;
  const onGroupJoinRef = useRef(onGroupJoin);
  onGroupJoinRef.current = onGroupJoin;
  const onGroupReorderRef = useRef(onGroupReorder);
  onGroupReorderRef.current = onGroupReorder;

  // --- Sortable IDs ----------------------------------------------------------

  const sortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const entry of state.groupedEntries) {
      if (isGroupEntry(entry)) {
        for (const member of entry.members) {
          if (isSpacer(member)) {
            ids.push(member.id);
          } else if (
            !(member as Record<string, unknown>).excludeFromReorder
          ) {
            ids.push(entryKey(member));
          }
        }
      } else if (isSpacer(entry)) {
        ids.push(entry.id);
      } else if (
        !(entry as Record<string, unknown>).excludeFromReorder
      ) {
        ids.push(entryKey(entry));
      }
    }
    return ids;
  }, [state.groupedEntries]);

  // --- onMove dispatch -------------------------------------------------------

  const handleMove = useCallback(
    (activeId: string, overId: string, event: DragEndEvent) => {
      if (activeId.startsWith(DRAG_GROUP_PREFIX)) {
        const gId = activeId.slice(DRAG_GROUP_PREFIX.length);
        onGroupReorderRef.current(gId, overId);
        return;
      }

      const zoneCollision = event.collisions?.find((c) => {
        const zone = (
          c.data?.droppableContainer?.data?.current as Record<string, unknown>
        )?.zone;
        return zone === "child" || zone === "group-join";
      });

      if (zoneCollision) {
        const zoneId = String(zoneCollision.id);
        if (zoneId.startsWith("group-zone:")) {
          const targetKey = zoneId.slice("group-zone:".length);
          onGroupCreateRef.current(activeId, targetKey);
          return;
        }
        if (zoneId.startsWith("group-join:")) {
          const groupId = zoneId.slice("group-join:".length);
          onGroupJoinRef.current(activeId, groupId);
          return;
        }
      }

      onDropRef.current(activeId, overId);
    },
    [],
  );

  // --- Spacer / group helpers ------------------------------------------------

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
    addSpacer,
    addGroup,
    dragInProgress: false,
  };

  // --- Render with overlay ---------------------------------------------------

  const renderOverlay = useCallback(
    (activeId: string) => {
      const contribution = entriesRef.current.find(
        (x) => entryKey(x) === activeId,
      );
      if (!contribution || isSpacer(contribution)) return null;
      return (
        <div className="rounded-md border border-border bg-background/90 shadow-lg">
          {renderItem(contribution as Contribution)}
        </div>
      );
    },
    [renderItem],
  );

  return (
    <ReorderAreaContext.Provider value={ctxValue}>
      <SortableList
        items={sortableIds}
        onMove={handleMove}
        overlay={editMode ? renderOverlay : undefined}
        disabled={!editMode}
        collisionDetection={reorderCollisionDetection}
      >
        {state.groupedEntries.map((entry) => {
          if (isGroupEntry(entry)) {
            return (
              <ReorderGroupBox
                key={entry.group.id}
                group={entry.group}
                storageId={storageId}
                editMode={editMode}
              >
                {entry.members.map((member) => {
                  if (isSpacer(member)) {
                    return (
                      <SpacerReorderItem
                        key={member.id}
                        itemKey={member.id}
                        storageId={storageId}
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
      </SortableList>
    </ReorderAreaContext.Provider>
  );
}
