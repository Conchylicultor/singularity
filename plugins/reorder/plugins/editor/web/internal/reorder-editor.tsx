import { Fragment, useMemo } from "react";
import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableList } from "@plugins/primitives/plugins/sortable-list/web";
import {
  ReorderAreaContext,
  RestoreButton,
  SpacerReorderItem,
  type ReorderAreaCtxValue,
} from "./items";
import type { ReorderEditorProps } from "./types";

/** Drag-id prefix for a whole-group drag handle. Shared contract: the group box
 *  uses `${DRAG_GROUP_PREFIX}${groupId}` as its draggable id. */
export const DRAG_GROUP_PREFIX = "reorder-drag-group-";

// Custom collision detection for the grouping case: filter zone droppables from
// `closestCenter` (so item displacement transforms stay correct) and append zone
// hits from `pointerWithin` (so group create/join dispatch at drop time via
// `event.collisions`). Only used when grouping is enabled.
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

/**
 * Presentational drag-and-drop reorder editor. Owns the `SortableList`, the move
 * dispatch, the flat `sortableIds`, the hidden/spacer affordances, and the area
 * context. It knows NOTHING about config_v2, the live contribution catalog, or
 * the `ReorderTree` storage format — the consumer maps its own data into
 * `entries` + callbacks.
 *
 * Group support degrades gracefully: when no group callbacks/entries are present
 * (`groupsEnabled` false), collision detection falls back to plain `closestCenter`,
 * grouping zones are not rendered, and the "Add Group" affordance is hidden.
 */
export function ReorderEditor({
  entries,
  hiddenItems,
  onDrop,
  onHide,
  onRestore,
  onAddSpacer,
  onDeleteSpacer,
  onGroupCreate,
  onGroupJoin,
  onGroupReorder,
  onAddGroup,
  editMode,
  orientation = "vertical",
  strategy,
  wrap = false,
  renderOverlay,
}: ReorderEditorProps) {
  const groupsEnabled =
    !!onGroupCreate ||
    !!onGroupJoin ||
    !!onGroupReorder ||
    entries.some((e) => e.kind === "group");

  const sortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of entries) {
      if (e.kind === "group") ids.push(...e.memberIds);
      else if (e.kind === "spacer") ids.push(e.id);
      else if (!e.excluded) ids.push(e.id);
    }
    return ids;
  }, [entries]);

  const handleMove = useMemo(
    () =>
      (activeId: string, overId: string, event: DragEndEvent) => {
        if (groupsEnabled && activeId.startsWith(DRAG_GROUP_PREFIX)) {
          onGroupReorder?.(activeId.slice(DRAG_GROUP_PREFIX.length), overId);
          return;
        }

        if (groupsEnabled) {
          const zoneCollision = event.collisions?.find((c) => {
            const zone = (
              c.data?.droppableContainer?.data?.current as Record<string, unknown>
            )?.zone;
            return zone === "child" || zone === "group-join";
          });
          if (zoneCollision) {
            const zoneId = String(zoneCollision.id);
            if (zoneId.startsWith("group-zone:")) {
              onGroupCreate?.(activeId, zoneId.slice("group-zone:".length));
              return;
            }
            if (zoneId.startsWith("group-join:")) {
              onGroupJoin?.(activeId, zoneId.slice("group-join:".length));
              return;
            }
          }
        }

        onDrop(activeId, overId);
      },
    [groupsEnabled, onDrop, onGroupCreate, onGroupJoin, onGroupReorder],
  );

  const ctxValue: ReorderAreaCtxValue = {
    orientation,
    onHide,
    onDeleteSpacer,
    groupsEnabled,
  };

  // The sortable cells + trailing restore button, shared by the bare and
  // wrap-container renders so dnd registration is identical in both.
  const itemNodes = (
    <>
      {entries.map((e) => {
        if (e.kind === "spacer") {
          return (
            <SpacerReorderItem key={e.id} itemKey={e.id} editMode={editMode} />
          );
        }
        // item + group nodes are opaque pre-rendered content.
        return <Fragment key={e.id}>{e.node}</Fragment>;
      })}
      {editMode && (
        <RestoreButton
          hiddenItems={hiddenItems}
          onAddGroup={onAddGroup}
          onAddSpacer={onAddSpacer}
          onRestore={onRestore}
        />
      )}
    </>
  );

  return (
    <ReorderAreaContext.Provider value={ctxValue}>
      <SortableList
        items={sortableIds}
        onMove={handleMove}
        overlay={editMode ? renderOverlay : undefined}
        disabled={!editMode}
        collisionDetection={groupsEnabled ? reorderCollisionDetection : undefined}
        orientation={orientation}
        strategy={strategy}
      >
        {wrap ? (
          // Editor-owned wrap container: a single honest flex parent of the
          // sortable cells, so a horizontal row wraps instead of overflowing.
          // `SortableContext` registers items by id regardless of DOM nesting,
          // so one extra div is invisible to dnd-kit.
          <div className="flex flex-1 flex-wrap content-start items-start gap-1.5 min-w-0">
            {itemNodes}
          </div>
        ) : (
          itemNodes
        )}
      </SortableList>
    </ReorderAreaContext.Provider>
  );
}
