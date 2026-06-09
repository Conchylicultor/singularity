# reorder

Generic reorder primitive integrated into `RenderSlot.Render` via middleware. Every `defineRenderSlot()` is automatically reorderable — no opt-in needed (pass `reorder: false` to opt out). DnD is applied through the middleware pipeline. Persists slot layout as **config_v2 directives** (JSONC files on disk, agent-editable, committable to git); iOS-style edit mode (pen button on `Shell.Toolbar`) toggles drag affordances globally.

## Public API (web)

```ts
import { setEditMode, useEditMode } from "@plugins/reorder/web";

// Toggle edit mode programmatically
setEditMode(true);

// Read edit mode state in React
const editMode = useEditMode();
```

Hosts just use `<MySlot.Render>{(item) => ...}</MySlot.Render>` — the reorder list and item middlewares handle sorting, DnD wrapping, user-created groups, and edit-mode affordances automatically. No configuration needed.

`id` is the **stable identifier** for a contribution in a slot. The directive references contributions by `entryKey` — `pluginId:id` (computed by `entryKey()`), which prevents collisions when different plugins contribute the same `id` to the same slot. Never rename `id` — renaming orphans the entry in any saved directive (it falls back to natural order, so nothing breaks, but the customization is lost).

## Rules for plugins using reorder

- All `RenderSlot` contributions must provide `id: string` (enforced by the type).
- Hosts use `<Slot.Render>`, not `slot.useContributions()`.
- `excludeFromReorder: true` opts a single contribution out (used by the pen button itself).

## Architecture

Two middlewares registered by the reorder plugin, built on `@plugins/primitives/plugins/sortable-list/web` (`@dnd-kit/sortable`):

1. **`ReorderListMiddleware`** (list, priority 0) — wraps the contribution list with `SortableList`, reads the slot's directive via `useConfig(descriptor)`, applies it over the live catalog via `applyDirective()`, renders groups/restore button in edit mode. Custom collision detection filters zone droppables from `closestCenter` (so displacement transforms work correctly) and appends zone hits from `pointerWithin` (for group create/join dispatch at drop time via `event.collisions`). If a slot has no descriptor (runtime-only render slot, `reorder:false`, or an unresolved id), it falls back to natural order with no reorder applied.
2. **`ReorderItemMiddleware`** (item, priority 50) — wraps each contribution with `SortableItem` for smooth displacement animations during drag. In edit mode, also renders grouping zones (center zone for group creation, join zone for existing groups).

## Storage — config_v2 directives

Slot layout lives in **config_v2**, not the DB. Each reorderable render slot gets one config_v2 descriptor (`reorderDirectiveDescriptor(slotId)` in `shared/directive.ts`) — a *directive* `{ order: string[]; hidden: string[] }` of `entryKey` strings:

- `order` — `entryKey[]` placed first, in that exact order; unmentioned contributions keep natural runtime order and append after.
- `hidden` — `entryKey[]` removed from the slot (never hides `excludeFromReorder` items).

The directive is **applied over the live catalog** at render (`applyDirective()` in `web/internal/sorting.ts`), so it is drift-tolerant: new contributions append, removed ones are ignored, and a changing catalog never invalidates a saved layout (the empty-directive default keeps the config hash stable).

Files land under the **defining** plugin: `config/<defining-plugin>/<slotId>.jsonc` (override) and `<slotId>.origin.jsonc` (generated default; its comments list every `entryKey` + label available in the slot — the "what can be reordered" catalog an agent reads). Agents edit layout by editing these files; defaults are committable to git and propagate to every worktree.

### web↔server bridge

The live server can't see web-slot contributions, so build-time codegen emits `shared/reorderable-slots.generated.ts` (`{ slotId, pluginId }[]`) from the slots facet. reorder registers one descriptor per slot on **both** runtimes from this manifest:

- web: `ConfigV2.WebRegister` (in `web/internal/config-registrations.ts`)
- server: `ConfigV2.Register` (in `server/internal/config-registrations.ts`)

both with the slot's `pluginId` so the file lands under the defining plugin. `useConfig`/`useSetConfig` match descriptors by **reference identity**, so the web runtime builds its descriptors once in `web/internal/descriptors.ts` and reuses those instances for both registration and reads.

The `reorderable-slots-in-sync` check fails if the manifest drifts; rebuild to regenerate.

### Write path

Drag-reorder computes the new full visible order and `setConfig("order", entryKey[])`. Hide → `setConfig("hidden", [...hidden, key])`; restore → `setConfig("hidden", hidden.filter(...))`. config_v2's set-field endpoint + watcher drive the live update across tabs (replacing the old `reorderPrefsResource.notify`).

### Caveats

- **subId collapses to slot scope.** `storageId = slotId[:subId]` is used for groups, but the config directive is keyed by the base `slotId` only — subIds aren't known at build. Sub-instances of one render slot therefore **share a single directive** (order/hidden apply to all instances). Intended.
- **Spacers are directive tokens.** A spacer is a synthetic `__spacer__<id>` string in the `order` array (never in `hidden`, never in a group). The edit-mode "Add Spacer" affordance materializes the current order and appends a `__spacer__<uuid>` token; the spacer's × button filters it back out. `applyDirective` walks `order` and emits a blank draggable gap per token, de-duplicating repeated tokens on read. Agents can hand-author gaps by inserting a `__spacer__<id>` string into a committed `order` array.
- **Groups stay DB-backed.** The `groups` sub-plugin is unchanged — group membership and group rank still live in Postgres and use `Rank`. Only top-level order/hidden moved to config.

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
  - Exports: Types: `ReorderableSlot`, `ReorderDirective`; Values: `reorderableSlots`, `reorderDirectiveDescriptor`
- Sub-plugins:
  - **`edit-mode`** — Pen button on the top toolbar that toggles global edit mode for all reorderable slots; Esc exits edit mode.
  - **`groups`** — User-created groups within reorderable areas. Drag items onto each other to form groups.

<!-- AUTOGENERATED:END -->
