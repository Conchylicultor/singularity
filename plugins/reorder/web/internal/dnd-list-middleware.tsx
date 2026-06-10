import {
  Fragment,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MdTune } from "react-icons/md";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { rectSortingStrategy } from "@plugins/primitives/plugins/sortable-list/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Button } from "@/components/ui/button";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { RenderSlotSubIdContext } from "@plugins/primitives/plugins/slot-render/web";
import {
  reorderGroupsResource,
  createGroup,
  patchGroup,
  addMembers,
  removeMemberEndpoint,
} from "@plugins/reorder/plugins/groups/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type {
  ReorderNode,
  ReorderTree,
} from "@plugins/fields/plugins/reorder-tree/core";
import {
  ReorderEditor,
  SpacerReorderItem,
  type ReorderEntry,
} from "@plugins/reorder/plugins/editor/web";
import { reorderDescriptors } from "./descriptors";
import { useEditMode } from "./edit-mode-store";
import { ReorderEffectiveEditModeContext } from "./effective-edit-mode";
import { ReorderGroupBox } from "./group-box";
import {
  applyTree,
  contributionKey,
  contributionLabel,
  entryKey,
  isGroupEntry,
  isSpacer,
  type SpacerItem,
  type TopLevelEntry,
} from "./sorting";
import { ReorderLayoutContext } from "./reorder-layout";

/**
 * Below this host width (px), a horizontal reorder area in edit mode is too
 * cramped to drag in place (chrome — ring, ×-badge, placeholder, +Add — overlaps
 * the content). Instead the inline view stays clean (display-only) and editing
 * moves into a roomy vertical popover. Above it, the row wraps onto extra lines.
 * A single tunable knee matched to the conversation-progress-card host class; not
 * a prop (no host needs to override it).
 */
const POPOVER_WIDTH_THRESHOLD = 280;

/**
 * Materialize the current full layout into a `ReorderTree`: a bare string per
 * visible contribution (terse), a `{ spacer }` node per spacer, and a
 * `{ item, hidden: true }` node per hidden contribution (appended last so the
 * hidden set survives reorder/spacer writes). Optionally rewrites the node for
 * `hideKey` to `{ item, hidden: true }` (hide) — spacers are never hidden.
 *
 * `hidden` keys already present in `hideKey` are not duplicated; pass `hideKey`
 * to hide one of the currently-visible `entries`.
 */
function materializeTree(
  entries: (Contribution | SpacerItem)[],
  hiddenKeys: string[],
  hideKey?: string,
): ReorderTree {
  const tree: ReorderNode[] = [];
  for (const e of entries) {
    if (isSpacer(e)) {
      tree.push({ spacer: e.id });
    } else {
      const key = entryKey(e);
      if (key === hideKey) {
        tree.push({ item: key, hidden: true });
      } else {
        tree.push(key);
      }
    }
  }
  // Preserve the existing hidden set so a reorder/spacer write doesn't un-hide.
  for (const key of hiddenKeys) {
    if (key !== hideKey) tree.push({ item: key, hidden: true });
  }
  return tree;
}

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

  const [popoverOpen, setPopoverOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    "vertical",
  );
  // `null` until first measured — regime defaults to wrap (never overlaps) until
  // a real width is known, so we don't flash a collapse-into-popover on mount.
  const [hostWidth, setHostWidth] = useState<number | null>(null);
  // Measure the host (the sentinel's parent) for BOTH flex-direction and width.
  // ResizeObserver + rAF, no timers (repo rule; mirrors collapsible-wrap).
  useLayoutEffect(() => {
    const parent = sentinelRef.current?.parentElement;
    if (!parent) return;

    const recompute = () => {
      const dir = getComputedStyle(parent).flexDirection;
      setOrientation(
        dir === "row" || dir === "row-reverse" ? "horizontal" : "vertical",
      );
      setHostWidth(parent.clientWidth);
    };

    let rafId: number | null = null;
    const schedule = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(recompute);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(parent);
    recompute();

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // `useConfig` on a generically-typed descriptor returns a loose record;
  // read the single `items` field as a possibly-missing `ReorderTree`.
  const cfg = useConfig(descriptor) as unknown as { items?: ReorderTree };
  const items = useMemo<ReorderTree>(() => cfg.items ?? [], [cfg.items]);
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
    () => applyTree(contributions, items, groupsData),
    [contributions, items, groupsData],
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
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const hiddenKeysRef = useRef<string[]>([]);
  hiddenKeysRef.current = useMemo(
    () => state.hidden.map((c) => contributionKey(c)!),
    [state.hidden],
  );
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
    if (hiddenKeysRef.current.includes(key)) return;
    // Materialize the full layout, flipping `key` to `{ item, hidden: true }`.
    setConfigRef.current(
      "items",
      materializeTree(entriesRef.current, hiddenKeysRef.current, key),
    );
  }, []);

  const restoreItem = useCallback((key: string) => {
    if (!hiddenKeysRef.current.includes(key)) return;
    // Materialize the visible order, then re-add the restored item as a bare
    // string and drop it from the persisted hidden set.
    const tree = materializeTree(
      entriesRef.current,
      hiddenKeysRef.current.filter((k) => k !== key),
    );
    tree.push(key);
    setConfigRef.current("items", tree);
  }, []);

  const hideItemRef = useRef(hideItem);
  hideItemRef.current = hideItem;
  const restoreItemRef = useRef(restoreItem);
  restoreItemRef.current = restoreItem;

  // --- Spacers (config-backed) ----------------------------------------------

  const addSpacer = useCallback(() => {
    // Materialize the current full visible order so the spacer lands at the
    // visual end, not after only the explicitly-ordered items.
    const tree = materializeTree(entriesRef.current, hiddenKeysRef.current);
    tree.push({ spacer: crypto.randomUUID() });
    setConfigRef.current("items", tree);
  }, []);

  const deleteSpacer = useCallback((spacerId: string) => {
    // Materialize the current order minus the targeted spacer node. Materializing
    // (rather than filtering the raw tree) keeps the persisted layout consistent
    // with the rendered order even after an unsaved drag.
    const tree = materializeTree(
      entriesRef.current.filter((e) => !(isSpacer(e) && e.id === spacerId)),
      hiddenKeysRef.current,
    );
    setConfigRef.current("items", tree);
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

      setConfigRef.current(
        "items",
        materializeTree(next, hiddenKeysRef.current),
      );
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

  function addGroup() {
    void fetchEndpoint(createGroup, { slotId: storageId }, { body: {} });
  }

  // --- Map the grouped state into the editor's presentational entries --------

  const entries = useMemo<ReorderEntry[]>(
    () =>
      state.groupedEntries.map((entry): ReorderEntry => {
        if (isGroupEntry(entry)) {
          const memberIds: string[] = [];
          for (const m of entry.members) {
            if (isSpacer(m)) memberIds.push(m.id);
            else if (!(m as Record<string, unknown>).excludeFromReorder)
              memberIds.push(entryKey(m));
          }
          return {
            kind: "group",
            id: entry.group.id,
            memberIds,
            node: (
              <ReorderGroupBox
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
                        editMode={editMode}
                      />
                    );
                  }
                  return renderItem(member);
                })}
              </ReorderGroupBox>
            ),
          };
        }
        if (isSpacer(entry)) {
          return { kind: "spacer", id: entry.id };
        }
        return {
          kind: "item",
          id: entryKey(entry),
          excluded: !!(entry as Record<string, unknown>).excludeFromReorder,
          node: renderItem(entry),
        };
      }),
    [state.groupedEntries, storageId, editMode, renderItem],
  );

  // The drag overlay re-renders the active contribution (catalog-aware), so it
  // lives here, not in the presentational editor.
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

  // --- Constrained-space regime ----------------------------------------------
  // For a horizontal area in edit mode with NO host-owned wrapping (CollapsibleWrap
  // injects `ReorderLayoutContext`), pick by measured host width:
  //   • "host-wrap"   — host owns wrapping → render exactly as before.
  //   • "passthrough" — vertical or non-edit → no chrome overflow → render as before.
  //   • "editor-wrap" — wide enough → editor-owned flex-wrap so items stack, not overlap.
  //   • "popover"     — too narrow → clean display-only inline + edit in a vertical popover.
  const regime: "host-wrap" | "passthrough" | "editor-wrap" | "popover" =
    injected
      ? "host-wrap"
      : orientation === "vertical" || !editMode
        ? "passthrough"
        : hostWidth !== null && hostWidth < POPOVER_WIDTH_THRESHOLD
          ? "popover"
          : "editor-wrap";

  const wrap = regime === "editor-wrap";
  const strategy = injected?.strategy ?? (wrap ? rectSortingStrategy : undefined);

  // Shared callback wiring (ref-backed; identical write paths for both surfaces).
  const editorProps = {
    entries,
    hiddenItems,
    onDrop: (a: string, o: string) => onDropRef.current(a, o),
    onHide: (k: string) => hideItemRef.current(k),
    onRestore: (k: string) => restoreItemRef.current(k),
    onAddSpacer: () => addSpacerRef.current(),
    onDeleteSpacer: (t: string) => deleteSpacerRef.current(t),
    onGroupCreate: (a: string, t: string) => onGroupCreateRef.current(a, t),
    onGroupJoin: (a: string, g: string) => onGroupJoinRef.current(a, g),
    onGroupReorder: (g: string, o: string) => onGroupReorderRef.current(g, o),
    onAddGroup: addGroup,
    renderOverlay,
  };

  const sentinel = (
    <div ref={sentinelRef} style={{ display: "none" }} aria-hidden />
  );

  if (regime === "popover") {
    return (
      <>
        {sentinel}
        {/* Inline: the live contributions in DISPLAY mode (override forces every
            item/group non-draggable, no chrome, no SortableContext). */}
        <ReorderEffectiveEditModeContext.Provider value={false}>
          {entries.map((e) =>
            e.kind === "spacer" ? (
              <SpacerReorderItem key={e.id} itemKey={e.id} editMode={false} />
            ) : (
              <Fragment key={e.id}>{e.node}</Fragment>
            ),
          )}
        </ReorderEffectiveEditModeContext.Provider>
        {/* Editing happens in a roomy vertical popover — the only drag surface. */}
        <InlinePopover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          tooltip="Edit layout"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit layout"
              // Stop the pointerdown from reaching an ancestor reorder item's
              // dnd-kit sensor (which would capture the pointer and swallow the
              // popover-trigger click) — same guard the hide/spacer buttons use.
              onPointerDown={(e) => e.stopPropagation()}
              // `pointer-events-auto` re-enables the trigger when this area is
              // nested inside another reorder item, whose edit-mode content
              // wrapper is `pointer-events-none`. The popover content portals to
              // <body>, escaping that trap — so a nested narrow area becomes
              // editable here even though inline drag never was.
              className="shrink-0 pointer-events-auto"
            >
              <MdTune className="size-3.5" />
            </Button>
          }
          contentClassName="w-72 p-2"
        >
          <ReorderEditor {...editorProps} editMode orientation="vertical" />
        </InlinePopover>
      </>
    );
  }

  return (
    <>
      {sentinel}
      <ReorderEditor
        {...editorProps}
        editMode={editMode}
        orientation={orientation}
        strategy={strategy}
        wrap={wrap}
      />
    </>
  );
}
