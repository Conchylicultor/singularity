# reorder

Generic reorder primitive integrated into `RenderSlot.Render` via middleware. Every `defineRenderSlot()` is automatically and unconditionally reorderable — there is no opt-out flag. A slot that should *not* be reorderable is a headless slot: declare it with `defineMountSlot()` (its contributions render nothing, so order is meaningless) — mount slots are absent from the reorder manifest. DnD is applied through the middleware pipeline. Persists slot layout as a **config_v2 `items` tree** (JSONC files on disk, agent-editable, committable to git); iOS-style edit mode (pen button on `Shell.Toolbar`) toggles drag affordances globally.

## Public API (web)

```ts
import { setEditMode, useEditMode } from "@plugins/reorder/web";

// Toggle edit mode programmatically
setEditMode(true);

// Read edit mode state in React
const editMode = useEditMode();
```

Hosts just use `<MySlot.Render>{(item) => ...}</MySlot.Render>` — the reorder list and item middlewares handle sorting, DnD wrapping, registry-driven node types (spacers, container groups), and edit-mode affordances automatically. No configuration needed.

`id` is the **stable identifier** for a contribution in a slot. The layout tree references contributions by `entryKey` — `pluginId:id` (computed by `entryKey()`), which prevents collisions when different plugins contribute the same `id` to the same slot. Never rename `id` — renaming orphans the entry in any saved layout (an orphaned name in the tree is skipped on read and the live contribution falls back to natural-order append, so nothing disappears, but the customization is lost).

## Rules for plugins using reorder

- All `RenderSlot` contributions must provide `id: string` (enforced by the type).
- Hosts use `<Slot.Render>`, not `slot.useContributions()`.
- `excludeFromReorder: true` opts a single contribution out (used by the pen button itself).

## Architecture

Two middlewares registered by the reorder plugin, built on the shared
presentational editor `@plugins/reorder/plugins/editor/web` (itself wrapping
`@plugins/primitives/plugins/sortable-list/web` / `@dnd-kit/sortable`):

1. **`ReorderListMiddleware`** (list, priority 0) — reads the slot's `items` tree via `useConfig(descriptor)`, applies it over the live catalog via `applyTree()`, maps the resulting `groupedEntries` into the editor's presentational `entries` (items as item-middleware-wrapped contributions, spacers, pre-rendered group boxes), and renders `<ReorderEditor>` wired to `setConfig` + the DB-backed group endpoints. If a slot has no descriptor (runtime-only render slot or an unresolved id), it falls back to natural order with no reorder applied.
2. **`ReorderItemMiddleware`** (item, priority 50) — wraps each contribution with `SortableReorderItem` (from the editor barrel) for smooth displacement animations during drag. In edit mode, also renders grouping zones (center zone for group creation, join zone for existing groups).

### Shared presentational editor (`plugins/editor`)

The drag-and-drop list itself lives in the **`editor` sub-plugin**
(`plugins/reorder/plugins/editor/`) as `<ReorderEditor>` — a purely
presentational component (SortableList + move dispatch + flat `sortableIds` +
hide/restore + registry-driven `inserts`/`onRemoveNode`). It has just two opaque
entry kinds — `item` and a generic `node` (with optional `memberIds` for
containers) — and knows nothing about config_v2, the live catalog, the
`ReorderTree` format, or any specific node type; the consumer pre-renders each
node via the node-type registry and maps its own data into `entries` + callbacks,
threading `editMode`/`orientation` as props (the editor does **not** read the
global `useEditMode()` signal). This lets the **same editor** power both the
in-app pen-drag (this middleware, wired to `setConfig`) and the `reorder-tree`
field renderer in the Config settings pane (`fields/reorder-tree/plugins/config/web`,
wired to the field's `onChange`). Because the editor imports neither `reorder/web`
nor the `reorder-tree` field, the field plugin can import it without a
`reorder ↔ reorder-tree` cycle.

## Storage — config_v2 `items` tree (materialized)

Slot layout lives in **config_v2**, not the DB. Each reorderable render slot gets one config_v2 descriptor (`reorderDirectiveDescriptor(slotId)` in `shared/directive.ts`) — a single `items` field of type `reorder-tree` (`@plugins/fields/plugins/reorder-tree`). The value is a **tree** (`ReorderTree = ReorderNode[]`) whose core format reserves only the structural fields; everything else is per-node-type payload:

```ts
type ReorderNode =
  | string                                   // terse: coerces to { item }
  | { item: string; hidden?: boolean }       // entryKey; hidden = remove from slot
  | { type: string; id?: string;             // any registered node type (dispatch by `type`)
      items?: ReorderNode[];                 // structural child-list (containers only)
      [payload: string]: unknown };          // per-type payload, OWNED by the node type
```

- An `item` node names a contribution by `entryKey`. A bare string is the terse form (coerces to `{ item }`). `{ item, hidden: true }` removes it from the slot (never hides `excludeFromReorder` items).
- Every **extension** node is `{ type, … }` — dispatched to the **node-type registry** (`@plugins/reorder/plugins/node-types`). The core format knows only the structural `type`/`id`/`items`; `label`/`collapsed`/etc. are each node type's own payload (validated by its `schema`). Built-ins: `{ type: "spacer", id }` (a blank draggable gap) and `{ type: "header", label?, collapsed?, items: [...] }` (a labeled, collapsible **container**). Containers are **one level — no nesting**.
- An **unknown** `type` (or invalid payload) is skipped at render (fail-soft).

The tree is **applied over the live catalog** at render (`applyTree()` in `web/internal/sorting.ts`) via `normalizeNode`: named items emit in tree order, hidden items route to the hidden bucket, container members resolve and are **consumed** (so they don't re-emit at top level), unknown names are skipped, and **any live, visible contribution not named in the tree is appended in natural order** (fail-loud — a contribution is never silently dropped). `excludeFromReorder` items stay pinned last. Both consumers (this middleware and the config-pane field renderer) pre-render each node via `useReorderNodeTypes()` and hand the editor opaque `node` content.

### Materialized origin (not a sparse patch)

Unlike the old drift-tolerant directive (empty default, stable hash), the generated origin's `items` default is the **full current catalog** — every contribution's `entryKey` in natural order (bare strings). The catalog is materialized at build time by `setDefaultOriginDefaultsPreparer` in `reorderable-slots-gen.ts`, so the origin's `@hash` reflects the live catalog. **Adding/removing a contribution shifts the hash**, marking committed overrides stale — the config file is the authoritative layout, not a sparse patch over a live list. See "Staleness / reconciliation" below.

Files land under the **defining** plugin: `config/<defining-plugin>/<slotId>.jsonc` (override) and `<slotId>.origin.jsonc` (generated default; its `items` array is the materialized catalog, and a slim comment legend maps each `entryKey` → label). Agents edit layout by editing these files; defaults are committable to git and propagate to every worktree. See [`authoring-overrides.md`](./authoring-overrides.md) for the rules (ordering, when to add a spacer, when to hide). The `reorder:configs-authored` check requires every reorderable slot to have an authored override (currently-unconfigured slots are grandfathered in `check/grandfathered-slots.ts`).

### web↔server bridge

The live server can't see web-slot contributions, so build-time codegen emits `shared/reorderable-slots.generated.ts` (`{ slotId, pluginId }[]`) from the slots facet. reorder registers one descriptor per slot on **both** runtimes from this manifest:

- web: `ConfigV2.WebRegister` (in `web/internal/config-registrations.ts`)
- server: `ConfigV2.Register` (in `server/internal/config-registrations.ts`)

both with the slot's `pluginId` so the file lands under the defining plugin. `useConfig`/`useSetConfig` match descriptors by **reference identity**, so the web runtime builds its descriptors once in `web/internal/descriptors.ts` and reuses those instances for both registration and reads.

The `reorderable-slots-in-sync` check fails if the manifest drifts; rebuild to regenerate.

### Write path

Every edit **materializes** the top-level order into a fresh `items` tree (`materializeTree` in `dnd-list-middleware.tsx`) and `setConfig("items", tree)`. Container subtrees are re-emitted **verbatim** from the raw tree (members/payload preserved) — in-app editing rewrites only the loose top-level items/spacers around them:

- **Drag reorder:** the new top-level order — contributions as bare strings, leaf/container nodes verbatim; the existing hidden set is appended as `{ item, hidden: true }` so a reorder never un-hides.
- **Hide / restore:** materialize, flipping the target to/from `{ item, hidden: true }`.
- **Insert (registry-driven):** node types declaring `insert` (e.g. spacer's "Add Spacer") append `insert.create()`. **Remove:** `onRemoveNode(id)` drops the node by id (top-level or inside a container).
- **Patch:** `onPatch(id, partial)` shallow-merges into the addressed node's payload (e.g. the header collapse toggle). Containers are addressed by `id`; a hand-authored container without one gets a `crypto.randomUUID()` assigned on its first in-app write (reads never mutate config).

config_v2's set-field endpoint + watcher drive the live update across tabs.

**Personal vs everyone scope.** The write above is the **personal** path
(`setConfig("items", tree)` → user layer). In **everyone** scope the middleware
instead stages the materialized tree as a committed git-layer default via the
generic [`config_v2/staging`](../config_v2/plugins/staging/CLAUDE.md) primitive —
`stageDefault(pluginId, slotId, { items: tree })` — never touching the user
layer; the staged tree shows inline as a preview (`useStagedTree`, a thin
reorder-side adapter over `useStagedValue`). Reorder owns only the `{ items }`
value shape + a contributed `Staging.DiffRenderer` (the moved/shown/hidden tree
diff); the stage/apply/land machinery and the review-pane section are generic.
The pen-button commit gate (`reorder/edit-mode`) drives Apply-all / Discard-all
through the generic hooks. See the config_v2 doc's "Promoting a runtime edit to a
git default" for the full pipeline.

### Staleness / reconciliation semantics

Because the origin default is the materialized catalog, adding/removing a contribution shifts the slot's origin `@hash`. Two independent reconciliations, both **existing config_v2 behavior** (no bespoke logic):

- **Code ↔ git override** (`config/<plugin>/<slot>.jsonc`): a committed override whose `@hash` no longer matches the regenerated origin **hard-fails `config-origins-in-sync`**, which runs on `push` → push is blocked until an agent reconciles (edit the committed file to place the new item explicitly — the regenerated origin shows the full current list — and re-stamp the hash). This is the agent-facing forcing function.
- **User override ↔ git** (`~/.singularity/config/<wt>/.../<slot>.jsonc`): on hash conflict, `effective()` reverts to the origin (natural order) at runtime; the user sees the conflict in the config settings UI and fixes it manually. No `effective()` bypass.
- During the stale window, `applyTree` still appends any unmentioned live contribution (fail-loud) so nothing disappears.

### Caveats

- **subId collapses to slot scope.** The config layout is keyed by the base `slotId` only — subIds aren't known at build. Sub-instances of one render slot therefore **share a single layout**. Intended.
- **Per-row reorderable slots need no wrapper.** A reorderable slot rendered once per row in a list (e.g. `JsonlViewer.RowAction` per message row) subscribes per render site, but the underlying config subscription is **shared and kept alive at the live-state layer** (one cache entry + one kept-alive WS sub across all rows). No manual hoisting provider is required — just render `<Slot.Render>` per row as usual.
- **Node types are extensible (registry-driven).** Spacer and the `header` container are just the first built-ins; add a node type by dropping a sub-plugin under `plugins/reorder/plugins/node-types/plugins/` that contributes `ReorderNodes.NodeType(...)` — no edits to the core format, the editor, or the consumers. Agents hand-author nodes via the `{ "type": … }` shapes shown in each origin file's comment legend.
- **Groups (containers) are config-only this pass.** In-app edit mode reorders loose items/spacers, hides/restores, adds spacers, and toggles a container's `collapsed` — but does **not** create/destroy containers or change their membership/order (author that in the JSONC). Containers are not top-level draggable yet (no drag handle/rank). The old DB-backed `groups` sub-plugin (Postgres tables + `Rank` + endpoints) was **deleted**.

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

- Description: Generic reorder primitive: every defineRenderSlot is unconditionally reorderable; use defineMountSlot for headless slots. DnD is automatic via middleware. Generic reorder primitive: per-slot config_v2 directives for contribution order/visibility.
- Load-bearing: yes
- Web:
  - Contributes: `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `Staging.DiffRenderer` → `ReorderDiffRenderer`
  - Uses: `config_v2.ConfigV2`, `config_v2.useConfig`, `config_v2.useSetConfig`, `config_v2/staging.Staging`, `config_v2/staging.useStageDefault`, `config_v2/staging.useStagedValue`, `primitives/css/badge.Badge`, `primitives/css/placeholder.Placeholder`, `primitives/css/spacing.Stack`, `primitives/css/text.Text`, `primitives/css/ui-kit.Button`, `primitives/element-size.useResizeObserver`, `primitives/latest-ref.useLatestRef`, `primitives/popover.InlinePopover`, `primitives/slot-render.registerSlotItemMiddleware`, `primitives/slot-render.registerSlotListMiddleware`, `primitives/sortable-list.rectSortingStrategy`, `reorder/editor.ReorderAreaContext`, `reorder/editor.ReorderEditor`, `reorder/editor.ReorderEntry`, `reorder/editor.SortableReorderItem`, `reorder/node-types.useReorderNodeTypes`
  - Exports: Types: `ReorderDiffEntry`, `ReorderLayout`, `ReorderScope`, `ReorderTreesDiff`; Values: `diffReorderTrees`, `getEditMode`, `getReorderScope`, `ReorderLayoutContext`, `setEditMode`, `setReorderScope`, `useEditMode`, `useReorderScope`
- Server:
  - Uses: `config_v2.ConfigV2`
  - Exports: Values: `reorderableSlots`, `reorderDirectiveDescriptor`
- Cross-plugin:
  - Imported by: `primitives/collapsible-wrap`, `reorder/edit-mode`
- Shared:
  - Exports: Types: `ReorderableSlot`; Values: `reorderableSlots`, `reorderDirectiveDescriptor`
- Sub-plugins:
  - **`edit-mode`** — Pen button on the top toolbar that toggles global edit mode for all reorderable slots; Esc exits edit mode.
  - **`editor`** — Presentational drag-and-drop reorder editor: sortable items, hide/restore, spacers, optional grouping zones. Display-only — no config_v2, catalog, or tree-format knowledge.
  - **`node-types`** — Reorder node-type registry: owns the reorder.node-type slot and the useReorderNodeTypes() read hook. Slot owner only — contributes no node types itself.

<!-- AUTOGENERATED:END -->
