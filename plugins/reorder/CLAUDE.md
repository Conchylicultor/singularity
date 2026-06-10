# reorder

Generic reorder primitive integrated into `RenderSlot.Render` via middleware. Every `defineRenderSlot()` is automatically reorderable — no opt-in needed (pass `reorder: false` to opt out). DnD is applied through the middleware pipeline. Persists slot layout as a **config_v2 `items` tree** (JSONC files on disk, agent-editable, committable to git); iOS-style edit mode (pen button on `Shell.Toolbar`) toggles drag affordances globally.

## Public API (web)

```ts
import { setEditMode, useEditMode } from "@plugins/reorder/web";

// Toggle edit mode programmatically
setEditMode(true);

// Read edit mode state in React
const editMode = useEditMode();
```

Hosts just use `<MySlot.Render>{(item) => ...}</MySlot.Render>` — the reorder list and item middlewares handle sorting, DnD wrapping, user-created groups, and edit-mode affordances automatically. No configuration needed.

`id` is the **stable identifier** for a contribution in a slot. The layout tree references contributions by `entryKey` — `pluginId:id` (computed by `entryKey()`), which prevents collisions when different plugins contribute the same `id` to the same slot. Never rename `id` — renaming orphans the entry in any saved layout (an orphaned name in the tree is skipped on read and the live contribution falls back to natural-order append, so nothing disappears, but the customization is lost).

## Rules for plugins using reorder

- All `RenderSlot` contributions must provide `id: string` (enforced by the type).
- Hosts use `<Slot.Render>`, not `slot.useContributions()`.
- `excludeFromReorder: true` opts a single contribution out (used by the pen button itself).

## Architecture

Two middlewares registered by the reorder plugin, built on the shared
presentational editor `@plugins/reorder/plugins/editor/web` (itself wrapping
`@plugins/primitives/plugins/sortable-list/web` / `@dnd-kit/sortable`):

1. **`ReorderListMiddleware`** (list, priority 0) — reads the slot's `items` tree via `useConfig(descriptor)`, applies it over the live catalog via `applyTree()`, maps the resulting `groupedEntries` into the editor's presentational `entries` (items as item-middleware-wrapped contributions, spacers, pre-rendered group boxes), and renders `<ReorderEditor>` wired to `setConfig` + the DB-backed group endpoints. If a slot has no descriptor (runtime-only render slot, `reorder:false`, or an unresolved id), it falls back to natural order with no reorder applied.
2. **`ReorderItemMiddleware`** (item, priority 50) — wraps each contribution with `SortableReorderItem` (from the editor barrel) for smooth displacement animations during drag. In edit mode, also renders grouping zones (center zone for group creation, join zone for existing groups).

### Shared presentational editor (`plugins/editor`)

The drag-and-drop list itself lives in the **`editor` sub-plugin**
(`plugins/reorder/plugins/editor/`) as `<ReorderEditor>` — a purely
presentational component (SortableList + move dispatch + flat `sortableIds` +
hide/restore/spacer affordances + grouping zones). It knows nothing about
config_v2, the live catalog, or the `ReorderTree` format; the consumer maps its
own data into `entries` + callbacks and threads `editMode`/`orientation` as
props (the editor does **not** read the global `useEditMode()` signal). This lets
the **same editor** power both the in-app pen-drag (this middleware, wired to
`setConfig`) and the `reorder-tree` field renderer in the Config settings pane
(`fields/reorder-tree/plugins/config/web`, wired to the field's `onChange`).
Because the editor imports neither `reorder/web` nor the `reorder-tree` field, the
field plugin can import it without a `reorder ↔ reorder-tree` cycle. Group support
degrades gracefully: with no group callbacks/entries, collision falls back to
plain `closestCenter`, grouping zones aren't rendered, and "Add Group" is hidden
(the field editor's mode — groups stay deferred there).

## Storage — config_v2 `items` tree (materialized)

Slot layout lives in **config_v2**, not the DB. Each reorderable render slot gets one config_v2 descriptor (`reorderDirectiveDescriptor(slotId)` in `shared/directive.ts`) — a single `items` field of type `reorder-tree` (`@plugins/fields/plugins/reorder-tree`). The value is a **recursive tagged-node tree** (`ReorderTree = ReorderNode[]`):

```ts
type ReorderNode =
  | string                                   // terse: coerces to { item }
  | { item: string; hidden?: boolean }       // entryKey; hidden = remove from slot
  | { spacer: string }                       // spacer id → blank draggable gap
  | { group: string; items: ReorderNode[] }; // RESERVED — groups deferred, never emitted yet
```

- An `item` node names a contribution by `entryKey`. A bare string is the terse form (coerces to `{ item }`). `{ item, hidden: true }` removes it from the slot (never hides `excludeFromReorder` items).
- A `spacer` node materializes a blank draggable gap at its position; the spacer id is a `crypto.randomUUID()`.
- The `group` arm is **reserved** so groups can slot in later without a format migration. The editor never emits or parses it, and `applyTree` ignores it — groups stay DB-backed (see Caveats).

The tree is **applied over the live catalog** at render (`applyTree()` in `web/internal/sorting.ts`) via `normalizeNode`: named items emit in tree order, hidden items route to the hidden bucket, spacers emit gaps, unknown names are skipped, and **any live, visible contribution not named in the tree is appended in natural order** (fail-loud — a contribution is never silently dropped). `excludeFromReorder` items stay pinned last.

### Materialized origin (not a sparse patch)

Unlike the old drift-tolerant directive (empty default, stable hash), the generated origin's `items` default is the **full current catalog** — every contribution's `entryKey` in natural order (bare strings). The catalog is materialized at build time by `setDefaultOriginDefaultsPreparer` in `reorderable-slots-gen.ts`, so the origin's `@hash` reflects the live catalog. **Adding/removing a contribution shifts the hash**, marking committed overrides stale — the config file is the authoritative layout, not a sparse patch over a live list. See "Staleness / reconciliation" below.

Files land under the **defining** plugin: `config/<defining-plugin>/<slotId>.jsonc` (override) and `<slotId>.origin.jsonc` (generated default; its `items` array is the materialized catalog, and a slim comment legend maps each `entryKey` → label). Agents edit layout by editing these files; defaults are committable to git and propagate to every worktree.

### web↔server bridge

The live server can't see web-slot contributions, so build-time codegen emits `shared/reorderable-slots.generated.ts` (`{ slotId, pluginId }[]`) from the slots facet. reorder registers one descriptor per slot on **both** runtimes from this manifest:

- web: `ConfigV2.WebRegister` (in `web/internal/config-registrations.ts`)
- server: `ConfigV2.Register` (in `server/internal/config-registrations.ts`)

both with the slot's `pluginId` so the file lands under the defining plugin. `useConfig`/`useSetConfig` match descriptors by **reference identity**, so the web runtime builds its descriptors once in `web/internal/descriptors.ts` and reuses those instances for both registration and reads.

The `reorderable-slots-in-sync` check fails if the manifest drifts; rebuild to regenerate.

### Write path

Every edit **materializes** the full visible order into a fresh `items` tree (`materializeTree` in `dnd-list-middleware.tsx`) and `setConfig("items", tree)`:

- **Drag reorder:** the new visible order as bare strings (+ `{ spacer }` per spacer); the existing hidden set is appended as `{ item, hidden: true }` nodes so a reorder never un-hides.
- **Hide:** the same materialization, flipping the target item's node to `{ item, hidden: true }`. **Restore:** materialize, drop the key from the hidden set, and re-append it as a bare string.
- **Add spacer:** materialize + append `{ spacer: crypto.randomUUID() }`. **Delete spacer:** materialize the order minus that spacer node.

config_v2's set-field endpoint + watcher drive the live update across tabs.

### Staleness / reconciliation semantics

Because the origin default is the materialized catalog, adding/removing a contribution shifts the slot's origin `@hash`. Two independent reconciliations, both **existing config_v2 behavior** (no bespoke logic):

- **Code ↔ git override** (`config/<plugin>/<slot>.jsonc`): a committed override whose `@hash` no longer matches the regenerated origin **hard-fails `config-origins-in-sync`**, which runs on `push` → push is blocked until an agent reconciles (edit the committed file to place the new item explicitly — the regenerated origin shows the full current list — and re-stamp the hash). This is the agent-facing forcing function.
- **User override ↔ git** (`~/.singularity/config/<wt>/.../<slot>.jsonc`): on hash conflict, `effective()` reverts to the origin (natural order) at runtime; the user sees the conflict in the config settings UI and fixes it manually. No `effective()` bypass.
- During the stale window, `applyTree` still appends any unmentioned live contribution (fail-loud) so nothing disappears.

### Caveats

- **subId collapses to slot scope.** `storageId = slotId[:subId]` is used for groups, but the config layout is keyed by the base `slotId` only — subIds aren't known at build. Sub-instances of one render slot therefore **share a single layout**. Intended.
- **Spacers are typed nodes.** A spacer is a `{ spacer: <uuid> }` node in the `items` tree (never hidden, never in a group); its raw uuid is the runtime spacer id. The edit-mode "Add Spacer" affordance appends one; the spacer's × button materializes the order minus that node. `applyTree` emits a blank draggable gap per spacer node, de-duplicating repeated ids on read. Agents can hand-author gaps by inserting a `{ "spacer": "<id>" }` node into a committed `items` array.
- **Groups stay DB-backed (deferred in the tree).** The `groups` sub-plugin is unchanged — group membership and group rank still live in Postgres and use `Rank`. The `{ group }` union arm is reserved but never emitted/parsed; `applyTree` ignores it and keeps the existing DB-backed groups pass. Only top-level order/visibility/spacers moved to the config tree.

## Edit mode

Module-level signal in `web/internal/edit-mode-store.ts` (no React Context). The pen button toggles it; middlewares read it via `useSyncExternalStore`. Esc exits edit mode (handled by an invisible `Core.Root` contribution).

## Constrained-space regimes (horizontal areas)

Edit mode inflates every item with chrome (ring, ×-badge, empty-item placeholder, trailing `+Add`), which overflows a narrow horizontal band. The list middleware (`dnd-list-middleware.tsx`) measures the host width (ResizeObserver + rAF on the sentinel's parent, no timers) and picks a regime:

- **host-wrap** — a `CollapsibleWrap` host already owns wrapping (detected via the injected `ReorderLayoutContext`). Rendered exactly as before; the editor adds no wrapper (an interposed div would break CollapsibleWrap's child-measurement).
- **passthrough** — vertical orientation or not in edit mode. Vertical rows already stack `w-full`; outside edit mode there's no chrome. Unchanged render.
- **editor-wrap** — horizontal, edit mode, width ≥ `POPOVER_WIDTH_THRESHOLD` (280px). The editor wraps items onto multiple rows via its `wrap` prop + `rectSortingStrategy` (see `editor`'s CLAUDE.md). Also the default before the first width measurement (wrapping never overlaps).
- **popover** — horizontal, edit mode, width < threshold. The inline view renders the live contributions **display-only** (clean, not draggable) and a `MdTune` button opens a roomy **vertical** reorder popover hosting the full list (visible + hidden + spacers + groups). The popover is the only drag surface, so the single-`SortableContext`-per-dataset invariant holds.

**Effective edit mode.** The display-only inline render forces items/groups non-draggable via `ReorderEffectiveEditModeContext` (`web/internal/effective-edit-mode.tsx`, internal): `null` → read the global signal; `false` → display-only. `ReorderItemMiddleware` and `ReorderGroupBox` both honor it. The popover's editor is rendered OUTSIDE that provider, so its items read the global `true` and drag normally. All four regimes share the same `entriesRef`/`hiddenKeysRef` write paths — only the dispatching surface differs.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Generic reorder primitive. Slots opt in via defineRenderSlot reorder config; DnD is automatic via middleware. Generic reorder primitive: per-slot config_v2 directives for contribution order/visibility.
- Load-bearing: yes
- Web:
  - Contributes: `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`
  - Uses: `config_v2.ConfigV2`, `config_v2.useConfig`, `config_v2.useSetConfig`, `infra/endpoints.fetchEndpoint`, `primitives/collapsible.CollapsibleChevron`, `primitives/editable-field.useEditableField`, `primitives/live-state.useResource`, `primitives/popover.InlinePopover`, `primitives/slot-render.registerSlotItemMiddleware`, `primitives/slot-render.registerSlotListMiddleware`, `primitives/slot-render.RenderSlotSubIdContext`, `primitives/sortable-list.rectSortingStrategy`, `reorder/editor.DRAG_GROUP_PREFIX`, `reorder/editor.ReorderAreaContext`, `reorder/editor.ReorderEditor`, `reorder/editor.ReorderEntry`, `reorder/editor.SortableReorderItem`, `reorder/editor.SpacerReorderItem`
  - Exports: Types: `ReorderLayout`; Values: `getEditMode`, `ReorderLayoutContext`, `setEditMode`, `useEditMode`
- Server:
  - Uses: `config_v2.ConfigV2`
- Cross-plugin:
  - Imported by: `primitives/collapsible-wrap`, `reorder/edit-mode`
- Shared:
  - Exports: Types: `ReorderableSlot`; Values: `reorderableSlots`, `reorderDirectiveDescriptor`
- Sub-plugins:
  - **`edit-mode`** — Pen button on the top toolbar that toggles global edit mode for all reorderable slots; Esc exits edit mode.
  - **`editor`** — Presentational drag-and-drop reorder editor: sortable items, hide/restore, spacers, optional grouping zones. Display-only — no config_v2, catalog, or tree-format knowledge.
  - **`groups`** — User-created groups within reorderable areas. Drag items onto each other to form groups.

<!-- AUTOGENERATED:END -->
