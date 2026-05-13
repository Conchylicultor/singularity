# Fix Reorder DnD + Add Smooth Displacement Animations

## Context

The reorder plugin's drag-and-drop is broken — items don't reorder reliably. Two root causes:

1. **Zone sizing**: The three-zone system uses 8px strips for before/after zones, while the child zone (grouping) covers the entire item. With `pointerWithin` collision detection, ~60% of the item area triggers grouping instead of reordering. Users must hit a tiny 8px strip to successfully reorder.

2. **Zone info ignored in `onDrop`**: The handler uses `movingDown` (relative index comparison) instead of the actual before/after zone, producing incorrect placement when dragging across multiple items.

Additionally, there are no displacement animations — items are static during drag, with only the dragged item getting `opacity-40` and `translate3d`. No items "push away" to make room.

## Approach

Two changes:

1. **New generic `sortable-list` primitive** — a reusable `SortableList` + `SortableItem` component pair that any plugin can use. Knows nothing about reorder, ranks, or groups.
2. **Reorder plugin migrates** from the three-zone `useDraggable`/`useDroppable` system to the new primitive, keeping a small center zone overlay for grouping.

## Part 1: `sortable-list` primitive

### Location

New plugin: `plugins/primitives/plugins/sortable-list/`

```
plugins/primitives/plugins/sortable-list/
├── package.json
├── CLAUDE.md
└── web/
    ├── index.ts                  # exports SortableList, SortableItem
    └── internal/
        ├── sortable-list.tsx     # DndContext + SortableContext + DragOverlay
        └── sortable-item.tsx     # useSortable wrapper
```

### API

```tsx
import { SortableList, SortableItem } from "@plugins/primitives/plugins/sortable-list/web";
```

**`SortableList`** — bundles `DndContext` + `SortableContext` + sensors + collision + `DragOverlay`.

```tsx
interface SortableListProps {
  items: string[];                                                    // sortable IDs
  onMove: (activeId: string, overId: string, event: DragEndEvent) => void;
  overlay?: (activeId: string) => ReactNode;                          // optional floating preview
  disabled?: boolean;
  collisionDetection?: CollisionDetection;   // defaults to closestCenter
  children: ReactNode;
}
```

**`SortableItem`** — wraps a single item with displacement animation via `useSortable`.

```tsx
interface SortableItemState {
  isDragging: boolean;
  handleProps?: Record<string, unknown>;   // present when handle={true}
}

interface SortableItemProps {
  id: string;
  handle?: boolean;       // true = listeners NOT on wrapper, passed in render prop
  disabled?: boolean;
  className?: string;     // applied to wrapper div
  children: (state: SortableItemState) => ReactNode;
}
```

### Usage examples

**Simple case** (task-draft-form style — local state, `arrayMove`):

```tsx
<SortableList
  items={cards.map(c => c.localId)}
  onMove={(activeId, overId) => {
    const from = cards.findIndex(c => c.localId === activeId);
    const to = cards.findIndex(c => c.localId === overId);
    onCardsChange(arrayMove(cards, from, to));
  }}
>
  {cards.map(card => (
    <SortableItem key={card.localId} id={card.localId}>
      {({ isDragging }) => (
        <TaskDraftCard className={isDragging ? "opacity-50" : ""} ... />
      )}
    </SortableItem>
  ))}
</SortableList>
```

**With overlay + separate handle** (reorder plugin style):

```tsx
<SortableList
  items={sortableIds}
  onMove={(activeId, overId, event) => {
    if (overId.startsWith("group-zone:")) {
      onGroupCreate(activeId, overId.slice("group-zone:".length));
    } else {
      onDrop(activeId, overId);
    }
  }}
  overlay={(activeId) => renderItemPreview(activeId)}
  collisionDetection={reorderCollisionDetection}
>
  {items.map(item => (
    <SortableItem key={item.id} id={item.id} handle>
      {({ isDragging, handleProps }) => (
        <div className={isDragging ? "opacity-40" : ""}>
          <span {...handleProps}><MdDragIndicator /></span>
          <MyContent />
        </div>
      )}
    </SortableItem>
  ))}
</SortableList>
```

### What SortableList handles internally

- `DndContext` with `PointerSensor` (4px activation distance)
- `SortableContext` with `verticalListSortingStrategy`
- `DragOverlay` (only rendered if `overlay` prop provided)
- `onDragStart`/`onDragEnd`/`onDragCancel` state for `activeId`
- Passes `DragEndEvent` through to `onMove` for consumer-side modifier key detection

### What it does NOT handle (consumer's job)

- What to do on drop (`arrayMove`, `Rank.between`, tree `computeDrop`, etc.)
- How items look (render prop)
- Grouping, tree reparenting, custom zones
- Extra droppables (consumers add their own `useDroppable` inside the tree — they join the same `DndContext` automatically)

### Internal implementation

**`sortable-list.tsx`:**

```tsx
export function SortableList({ items, onMove, overlay, disabled, collisionDetection, children }: SortableListProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection ?? closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={(e) => {
        setActiveId(null);
        if (e.over && String(e.active.id) !== String(e.over.id)) {
          onMove(String(e.active.id), String(e.over.id), e);
        }
      }}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {overlay && (
        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeId ? overlay(activeId) : null}
        </DragOverlay>
      )}
    </DndContext>
  );
}
```

**`sortable-item.tsx`:**

```tsx
export function SortableItem({ id, handle, disabled, className, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const wrapperProps = handle
    ? {}                                     // listeners go to handleProps
    : { ...attributes, ...listeners };       // entire item is handle

  const state: SortableItemState = {
    isDragging,
    ...(handle ? { handleProps: { ...attributes, ...listeners } } : {}),
  };

  return (
    <div ref={setNodeRef} style={style} className={className} {...wrapperProps}>
      {children(state)}
    </div>
  );
}
```

---

## Part 2: Reorder plugin migration

### Step 1: `dnd-list-middleware.tsx` — Use `SortableList`

Replace manual `DndContext` + sensor setup + drag state with `<SortableList>`.

**Sortable ID list** — flat array from `groupedEntries`, excluding groups (they keep manual `useDraggable`) and `excludeFromReorder` items:

```tsx
const sortableIds = useMemo(() =>
  state.groupedEntries
    .filter(e => !isGroupEntry(e))
    .filter(e => isSpacer(e) || !(e as Record<string, unknown>).excludeFromReorder)
    .map(e => entryKey(e)),
  [state.groupedEntries]);
```

**Collision detection** — custom combiner that checks center zones first (via `pointerWithin`), falls back to `closestCenter` for sortable items:

```tsx
const reorderCollisionDetection: CollisionDetection = (args) => {
  const withinHits = pointerWithin(args);
  const zoneHit = withinHits.find(c =>
    c.data?.droppableContainer?.data?.current?.zone === "child"
  );
  if (zoneHit) return [zoneHit];
  return closestCenter(args);
};
```

**`onMove` handler** — dispatches on overId:

```tsx
onMove={(activeId, overId, event) => {
  if (overId.startsWith("group-zone:")) {
    onGroupCreateRef.current(activeId, overId.slice("group-zone:".length));
  } else if (overId.startsWith("group-join:")) {
    onGroupJoinRef.current(activeId, overId.slice("group-join:".length));
  } else {
    onDropRef.current(activeId, overId);
  }
}}
```

Remove: `overId`/`overData` state, `insertionIndicator`/`groupingIndicator` computation, all the manual `onDragStart`/`onDragOver`/`onDragEnd`/`onDragCancel` handlers.

### Step 2: `dnd-components.tsx` — Simplify drastically

**Remove**: `ReorderItemThreeZone`, `InsertionIndicator`, `GroupingIndicator`, `DRAG_PREFIX`, `DROP_PREFIX`, drop indicator rendering.

**Keep**: `RestoreButton`, `SpacerReorderItem` (convert to `SortableItem`).

**Add**: `GroupingZone` — a small center overlay `useDroppable` that the reorder item middleware renders inside each `SortableItem`:

```tsx
function GroupingZone({ itemKey }: { itemKey: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-zone:${itemKey}`,
    data: { zone: "child", targetId: itemKey },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute inset-x-0 top-[42.5%] bottom-[42.5%] z-10 rounded",
        isOver && "ring-2 ring-primary bg-accent/30",
      )}
    />
  );
}
```

This covers the center ~15% of the item. When pointer is within → `pointerWithin` detects it before `closestCenter` → triggers grouping. When pointer is outside → `closestCenter` handles sortable displacement → triggers reorder.

**Update `ReorderAreaCtxValue`**: remove `insertionIndicator`/`groupingIndicator`. Keep `storageId`, `hiddenItems`, `addSpacer`, `addGroup`, `dragInProgress`.

### Step 3: `dnd-item-middleware.tsx` — Use `SortableItem` + `GroupingZone`

```tsx
export function ReorderItemMiddleware({ contribution, children }) {
  const editMode = useEditMode();
  const ctx = useContext(ReorderAreaContext);
  const key = contributionKey(contribution);
  if (!key || !editMode || contribution.excludeFromReorder) return <>{children}</>;

  return (
    <SortableItem id={key} className="group/reorder-item relative">
      {({ isDragging }) => (
        <>
          <div className={cn("relative cursor-grab rounded-md ring-1 ring-primary/50",
                              isDragging && "opacity-40")}>
            <HideButton itemKey={key} storageId={ctx?.storageId ?? ""} />
            <div className="pointer-events-none">{children}</div>
          </div>
          <GroupingZone itemKey={key} />
        </>
      )}
    </SortableItem>
  );
}
```

### Step 4: `group-box.tsx` — No structural changes

Groups keep `useDraggable` for drag handle + `useDroppable` for group-join target. Not in `SortableContext`. The group-join droppable ID is prefixed `group-join:` so `onMove` can dispatch.

### Step 5: `styles.css` — Remove `.reorder-drop-indicator`

The blue insertion line is replaced by items smoothly shifting position.

---

## Files summary

### New files

| File | Description |
|---|---|
| `plugins/primitives/plugins/sortable-list/web/index.ts` | Barrel: exports `SortableList`, `SortableItem` |
| `plugins/primitives/plugins/sortable-list/web/internal/sortable-list.tsx` | `SortableList` component |
| `plugins/primitives/plugins/sortable-list/web/internal/sortable-item.tsx` | `SortableItem` component |
| `plugins/primitives/plugins/sortable-list/package.json` | Plugin package |
| `plugins/primitives/plugins/sortable-list/CLAUDE.md` | Plugin docs |

### Modified files

| File | Changes |
|---|---|
| `plugins/reorder/web/internal/dnd-list-middleware.tsx` | Use `SortableList`, custom collision, simplified `onMove` |
| `plugins/reorder/web/internal/dnd-components.tsx` | Remove `ReorderItemThreeZone`; add `GroupingZone`; convert `SpacerReorderItem` to `SortableItem` |
| `plugins/reorder/web/internal/dnd-item-middleware.tsx` | Use `SortableItem` + `GroupingZone` |
| `plugins/reorder/web/styles.css` | Remove `.reorder-drop-indicator` |

### Existing reference files

| File | Pattern |
|---|---|
| `plugins/tasks/plugins/task-draft-form/web/components/task-draft-card.tsx` | Working `useSortable` + `CSS.Transform` |
| `plugins/tasks/plugins/task-draft-form/web/components/task-draft-form.tsx` | Working `DndContext` + `SortableContext` + `verticalListSortingStrategy` |

---

## How center-zone grouping coexists with sortable

The center zone is a separate `useDroppable` rendered inside each `SortableItem`, covering the center ~15% of the item height. The custom collision detection works as follows:

1. First, check all droppables via `pointerWithin` for center-zone hits (zone=`"child"`)
2. If a center zone contains the pointer → return it (grouping mode)
3. Otherwise, fall back to `closestCenter` for sortable items (reorder mode)

**Visual feedback during drag:**

- When pointer is in top/bottom 42.5% of item → sortable displacement (items shift to make room)
- When pointer enters center 15% → sortable displacement pauses (items return to place), center zone highlights with `ring-2 ring-primary bg-accent/30`
- This provides natural feedback: "shifting = reorder, highlight = group"

---

## Edge cases

- **`excludeFromReorder` items**: Not in `sortableIds`, not wrapped in `SortableItem`. Render after sortable items, no drag affordance.
- **Spacers**: Participate in `SortableContext` as normal sortable items via `SortableItem`.
- **Groups**: Not in `SortableContext`. Keep manual `useDraggable`/`useDroppable`. Group reorder uses the existing `onGroupReorder` logic.
- **Group members**: Go through item middleware → `SortableItem`. Must be in `sortableIds`.
- **Drag cancel (Esc)**: `useSortable` handles snap-back animation automatically.
- **DragOverlay width**: `SortableList` captures the active element's width in `onDragStart` via `document.getElementById` and passes it to the overlay container.

## Verification

1. Enter edit mode → drag an item past its neighbor → neighbor slides smoothly
2. Drop → item animates to final position, order persists on refresh
3. Drag cancel (Esc) → items snap back with animation
4. Drag to center of item → grouping highlight appears, displacement pauses
5. Drop on center → creates/joins group
6. Drag spacer to new position
7. Drag group handle to reorder groups
8. Hide item (× button) → works as before
9. DragOverlay follows cursor with correct width
10. `task-draft-form` can be refactored to use `SortableList`/`SortableItem` (validates the API)
