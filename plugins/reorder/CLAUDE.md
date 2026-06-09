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

Two middlewares registered by the reorder plugin, built on `@plugins/primitives/plugins/sortable-list/web` (`@dnd-kit/sortable`):

1. **`ReorderListMiddleware`** (list, priority 0) — wraps the contribution list with `SortableList`, reads the slot's `items` tree via `useConfig(descriptor)`, applies it over the live catalog via `applyTree()`, renders groups/restore button in edit mode. Custom collision detection filters zone droppables from `closestCenter` (so displacement transforms work correctly) and appends zone hits from `pointerWithin` (for group create/join dispatch at drop time via `event.collisions`). If a slot has no descriptor (runtime-only render slot, `reorder:false`, or an unresolved id), it falls back to natural order with no reorder applied.
2. **`ReorderItemMiddleware`** (item, priority 50) — wraps each contribution with `SortableItem` for smooth displacement animations during drag. In edit mode, also renders grouping zones (center zone for group creation, join zone for existing groups).

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

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Generic reorder primitive. Slots opt in via defineRenderSlot reorder config; DnD is automatic via middleware. Generic reorder primitive: per-slot config_v2 directives for contribution order/visibility.
- Load-bearing: yes
- Web:
  - Contributes: `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`
  - Uses: `config_v2.ConfigV2`, `config_v2.useConfig`, `config_v2.useSetConfig`, `infra/endpoints.fetchEndpoint`, `primitives/collapsible.CollapsibleChevron`, `primitives/editable-field.useEditableField`, `primitives/live-state.useResource`, `primitives/popover.InlinePopover`, `primitives/row.Row`, `primitives/slot-render.registerSlotItemMiddleware`, `primitives/slot-render.registerSlotListMiddleware`, `primitives/slot-render.RenderSlotSubIdContext`, `primitives/sortable-list.SortableItem`, `primitives/sortable-list.SortableList`
  - Exports: Types: `ReorderLayout`; Values: `getEditMode`, `ReorderLayoutContext`, `setEditMode`, `useEditMode`
- Server:
  - Uses: `config_v2.ConfigV2`
- Cross-plugin:
  - Imported by: `primitives/collapsible-wrap`, `reorder/edit-mode`
- Shared:
  - Exports: Types: `ReorderableSlot`; Values: `reorderableSlots`, `reorderDirectiveDescriptor`
- Sub-plugins:
  - **`edit-mode`** — Pen button on the top toolbar that toggles global edit mode for all reorderable slots; Esc exits edit mode.
  - **`groups`** — User-created groups within reorderable areas. Drag items onto each other to form groups.

<!-- AUTOGENERATED:END -->
