import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { RenderSlotSubIdContext } from "@plugins/primitives/plugins/slot-render/web";
import { SortableList } from "@plugins/primitives/plugins/sortable-list/web";
import {
  reorderGroupsResource,
  createGroup,
  patchGroup,
  addMembers,
  removeMemberEndpoint,
} from "@plugins/reorder/plugins/groups/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ReorderDirective } from "../../shared/directive";
import { reorderDescriptors } from "./descriptors";
import { useEditMode } from "./edit-mode-store";
import { ReorderGroupBox } from "./group-box";
import {
  applyDirective,
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
import { ReorderLayoutContext } from "./reorder-layout";

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
  // `storageId` collapses `slotId[:subId]` to the base `slotId` for config:
  // sub-instances of a render slot share one directive (subIds aren't known at
  // build time). The descriptor is looked up by the base `slotId`.
  const descriptor = reorderDescriptors.get(slotId);

  // No descriptor (runtime-only render slot, `reorder:false`, or unresolved id)
  // → render naturally with no reorder applied. The branch is stable for a
  // given mount (slotId is a prop), so the hook split is safe.
  if (!descriptor) {
    return (
      <>{contributions.map((c) => renderItem(c))}</>
    );
  }

  return (
    <ReorderListMiddlewareInner
      slotId={slotId}
      descriptor={descriptor}
      contributions={contributions}
      renderItem={renderItem}
    />
  );
}

function ReorderListMiddlewareInner({
  slotId,
  descriptor,
  contributions,
  renderItem,
}: {
  slotId: string;
  descriptor: ConfigDescriptor;
  contributions: Contribution[];
  renderItem: (contribution: Contribution) => ReactNode;
}) {
  const subId = useContext(RenderSlotSubIdContext);
  const storageId = subId ? `${slotId}:${subId}` : slotId;
  const editMode = useEditMode();
  const injected = useContext(ReorderLayoutContext);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    "vertical",
  );
  useLayoutEffect(() => {
    const parent = sentinelRef.current?.parentElement;
    if (!parent) return;
    const dir = getComputedStyle(parent).flexDirection;
    setOrientation(
      dir === "row" || dir === "row-reverse" ? "horizontal" : "vertical",
    );
  }, []);

  // `useConfig` on a generically-typed descriptor returns a loose record;
  // treat it as a possibly-partial directive and fill defaults defensively.
  const directiveRaw = useConfig(descriptor) as unknown as Partial<ReorderDirective>;
  const directive = useMemo<ReorderDirective>(
    () => ({
      order: directiveRaw.order ?? [],
      hidden: directiveRaw.hidden ?? [],
    }),
    [directiveRaw],
  );
  const setConfig = useSetConfig(descriptor);

  // Groups stay DB-backed (untouched by the config migration).
  const groupsResult = useResource(reorderGroupsResource, {
    slotId: storageId,
  });
  const groupsData = useMemo(
    () => groupsResult.pending ? { groups: [], members: [] } : groupsResult.data,
    [groupsResult],
  );

  const state = useMemo(
    () => applyDirective(contributions, directive, groupsData),
    [contributions, directive, groupsData],
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
  const directiveRef = useRef(directive);
  directiveRef.current = directive;
  const membershipMapRef = useRef(state.membershipMap);
  membershipMapRef.current = state.membershipMap;
  const groupsDataRef = useRef(groupsData);
  groupsDataRef.current = groupsData;
  const groupedEntriesRef = useRef(state.groupedEntries);
  groupedEntriesRef.current = state.groupedEntries;
  const setConfigRef = useRef(setConfig);
  setConfigRef.current = setConfig;

  // --- Hide / restore (config-backed) ---------------------------------------

  const hideItem = useCallback((key: string) => {
    const hidden = directiveRef.current.hidden;
    if (hidden.includes(key)) return;
    setConfigRef.current("hidden", [...hidden, key]);
  }, []);

  const restoreItem = useCallback((key: string) => {
    const hidden = directiveRef.current.hidden;
    if (!hidden.includes(key)) return;
    setConfigRef.current(
      "hidden",
      hidden.filter((k) => k !== key),
    );
  }, []);

  const hideItemRef = useRef(hideItem);
  hideItemRef.current = hideItem;
  const restoreItemRef = useRef(restoreItem);
  restoreItemRef.current = restoreItem;

  // --- Spacers (config-backed) ----------------------------------------------

  const addSpacer = useCallback(() => {
    // Materialize the current full visible order so the spacer lands at the
    // visual end, not after only the explicitly-ordered items.
    const tokens = entriesRef.current.map((x) => entryKey(x));
    setConfigRef.current("order", [
      ...tokens,
      `${SPACER_PREFIX}${crypto.randomUUID()}`,
    ]);
  }, []);

  const deleteSpacer = useCallback((token: string) => {
    // Filter the persisted order only — never materialize (would bloat the
    // directive by promoting every natural-order item).
    setConfigRef.current(
      "order",
      directiveRef.current.order.filter((t) => t !== token),
    );
  }, []);

  const addSpacerRef = useRef(addSpacer);
  addSpacerRef.current = addSpacer;
  const deleteSpacerRef = useRef(deleteSpacer);
  deleteSpacerRef.current = deleteSpacer;

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

      // Reorder over the current visible (non-excluded) ordering, then persist
      // the full visible order as the new directive `order`.
      const reorderable = list.filter(
        (x) => !(x as Record<string, unknown>).excludeFromReorder,
      );
      const fromIdx = reorderable.findIndex((x) => entryKey(x) === draggedKey);
      const toIdx = reorderable.findIndex((x) => entryKey(x) === overKey);
      if (fromIdx < 0 || toIdx < 0) return;

      const next = reorderable.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved!);

      // If the dragged item was inside a group, pull it out (groups are DB-backed).
      // Spacers are never in a group, so skip the membership pull for them.
      const membership = isSpacer(dragged)
        ? undefined
        : membershipMapRef.current.get(draggedKey);
      if (membership) {
        void fetchEndpoint(removeMemberEndpoint, {
          slotId: storageId,
          contributionId: draggedKey,
        });
      }

      setConfigRef.current("order", next.map((x) => entryKey(x)));
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
        void fetchEndpoint(addMembers, { id: targetMembership.groupId }, {
          body: {
            slotId: storageId,
            contributionIds: [draggedKey],
          },
        });
        return;
      }

      void fetchEndpoint(createGroup, { slotId: storageId }, {
        body: {
          contributionIds: [targetKey, draggedKey],
        },
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

      void fetchEndpoint(addMembers, { id: groupId }, {
        body: {
          slotId: storageId,
          contributionIds: [draggedKey],
        },
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

      // Only groups carry a DB rank; ungrouped items have none, so a group
      // reordered next to an ungrouped item slots between adjacent group ranks.
      const entryRank = (entry: TopLevelEntry | null | undefined): Rank | null => {
        if (!entry) return null;
        if (isGroupEntry(entry)) return entry.group.rank;
        return null;
      };

      const newRank = Rank.between(entryRank(prev), entryRank(next));

      void fetchEndpoint(patchGroup, { id: groupId }, {
        body: { slotId: storageId, rank: newRank },
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

  function addGroup() {
    void fetchEndpoint(createGroup, { slotId: storageId }, { body: {} });
  }

  const ctxValue: ReorderAreaCtxValue = {
    storageId,
    hiddenItems,
    addGroup,
    addSpacer: () => addSpacerRef.current(),
    onHide: (key) => hideItemRef.current(key),
    onRestore: (key) => restoreItemRef.current(key),
    onDeleteSpacer: (token) => deleteSpacerRef.current(token),
    dragInProgress: false,
    orientation,
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
      <div ref={sentinelRef} style={{ display: "none" }} aria-hidden />
      <SortableList
        items={sortableIds}
        onMove={handleMove}
        overlay={editMode ? renderOverlay : undefined}
        disabled={!editMode}
        collisionDetection={reorderCollisionDetection}
        orientation={orientation}
        strategy={injected?.strategy}
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
              />
            );
          }
          return renderItem(entry);
        })}
        {editMode && (
          <RestoreButton
            hiddenItems={hiddenItems}
            addGroup={addGroup}
            addSpacer={() => addSpacerRef.current()}
            onRestore={(key) => restoreItemRef.current(key)}
          />
        )}
      </SortableList>
    </ReorderAreaContext.Provider>
  );
}
