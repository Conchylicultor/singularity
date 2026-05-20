# Unified Facet-Based Plugin Docgen & Catalog

## Context

Plugin metadata is extracted and rendered by two divergent systems that share the same raw data (`buildPluginTree`) but diverge into incompatible shapes:

- **Docgen** builds an enriched tree, renders markdown via hardcoded `renderPluginBody()`. Outputs `docs/plugins-compact.md`, `docs/plugins-details.md`, `docs/routes.md`, per-plugin `CLAUDE.md`.
- **Plugin-view UI** builds the same tree, transforms to a *different* `PluginNode` type via `toApiNode()`, adds `buildSymbolConsumers()`, serves over HTTP for the detail pane and catalog.

Adding new metadata requires touching ~5 files across both systems. The two `PluginNode` types drift apart. This plan unifies them via a **facet-based** architecture where each metadata type is self-contained.

## Target Architecture

### Lean PluginNode + Facet Bag

```typescript
interface PluginNode {
  dir: string; path: string; name: string; hierarchyId: string;
  description?: string; descriptions: Partial<Record<Runtime, string>>;
  loadBearing: boolean; collapsed: boolean;
  runtimes: Record<Runtime, boolean>;
  children: PluginNode[];
  facets: Record<string, unknown>;  // typed access via getFacet(node, def)
}
```

### Facet Definition

```typescript
interface FacetDef<T> { id: string; _phantom?: T; }
function defineFacet<T>(id: string): FacetDef<T>;
function getFacet<T>(node: PluginNode, def: FacetDef<T>): T | undefined;
function setFacet<T>(node: PluginNode, def: FacetDef<T>, data: T): void;
```

### Each Facet Exports

```typescript
export const facetDef: FacetDef<MyData>;
export function extract(ctx: ExtractContext): MyData;
export function relate?(ctx: RelateContext): void;  // cross-plugin pass
export function renderDoc(data: MyData, ctx: DocContext): string[];
// UI component stays in the existing plugin-view sub-plugin
```

### Two-Phase Pipeline (replaces three)

Always import barrels (side-effect-free by rule, ~2-3s acceptable). No separate regex static phase.

```
findAllPluginDirs() → collectCoreFields() → importAllBarrels()
  → for each facet: extract(modules, dir)
  → assembleTree()
  → for each facet: relate(allNodes)
  → PluginTree
```

### Wildcard Bun Stub

Replace the manual npm package stubs in `barrel-import/core/internal/stubs.ts` with a catch-all `build.onResolve` for `node_modules/` that returns an empty proxy module. Keep only the structurally required stubs (React, web-sdk/core, config/server, database/server).

## Facets

| Facet | Data | Current source | `relate()` computes |
|-------|------|----------------|-------------------|
| `exports` | Barrel exports by runtime, category, per-symbol consumers | `parseBarrelExports` + `buildSymbolConsumers` | `consumers[]` per symbol (inverts apiUses) |
| `slots` | defineSlot definitions + contributors | `parseDefineGroup("defineSlot")` | `contributors[]` per slot group |
| `commands` | defineCommand definitions | `parseDefineGroup("defineCommand")` | — |
| `contributions` | Static contributions + runtime DocMeta | `extractContributionsBlock` + `enrichPluginTreeDocs` | — |
| `routes` | HTTP/WS routes by runtime + callers | `parseRouteMap` | `callers[]` per route prefix |
| `resources` | defineResource calls | `parseResources` | — |
| `db-schema` | Tables, entity extensions, extendedBy | `findDbFiles` + `parseTableNames` + `parseEntityExtensionCalls` | `extendedBy[]` cross-refs |
| `cross-refs` | apiUses (all runtimes), importedBy | `parseServerApiUses` | `importedBy[]` (inverts apiUses) |
| `registrations` | Runtime register[] with DocMeta (MCP tools, jobs) | `enrichPluginTreeDocs` | — |

### Facet Inter-Dependencies During `relate()`

Some facets need data from other facets:
- `exports.relate()` needs `cross-refs` apiUses from all plugins to build per-symbol `consumers[]`
- `slots.relate()` needs `contributions` from all plugins to find slot contributors
- `routes.relate()` needs source files from all plugins to find endpoint callers

This means `relate()` receives the full tree and reads other facets via `getFacet()`. No ordering constraint needed — each facet reads already-extracted (Phase 1) data from other facets.

## File Structure

```
plugins/plugin-meta/plugins/facets/
  core/index.ts          — registry: allFacets array, iteration helpers
  plugins/
    exports/core/        — extract + relate + renderDoc
    slots/core/
    commands/core/
    contributions/core/
    routes/core/
    resources/core/
    db-schema/core/
    cross-refs/core/
    registrations/core/
```

## Implementation Steps

Each step is one agent conversation. Every step must pass `./singularity build` and produce byte-identical doc output until the final cleanup.

### Step 1: Foundation

**Goal**: `defineFacet` primitive + wildcard Bun stub.

- Create `plugins/plugin-meta/plugins/plugin-tree/core/internal/facets.ts` — `defineFacet()`, `getFacet()`, `setFacet()`
- Add `facets: Record<string, unknown>` to `PluginNode` in `plugin-tree.ts` (additive, non-breaking — initialize to `{}` in `collectPlugin`)
- Export from `plugin-tree/core/index.ts`
- In `barrel-import/core/internal/stubs.ts`: add wildcard `build.onResolve` for unrecognized `node_modules/` specifiers → empty proxy module. Remove individual stubs for `@xterm/*`, `@dnd-kit/*`, `react-diff-view`, `react-resizable-panels`, etc. Keep React, web-sdk/core, config/server, database/server stubs.

**Verify**: `./singularity build` succeeds. All ~150 barrel imports still work. Doc output unchanged.

### Step 2: Facets Umbrella + First Facets (exports, slots, commands)

**Goal**: Prove the facet pattern end-to-end with three simple facets.

- Create `plugins/plugin-meta/plugins/facets/` umbrella with `package.json`
- Create `exports`, `slots`, `commands` facet plugins (each with only `core/index.ts`)
- Each facet: move the relevant parsing helpers from `plugin-tree.ts`, implement `extract()` and `renderDoc()`
- `exports.relate()` computes per-symbol `consumers[]` (moves `buildSymbolConsumers` logic)
- Wire into `buildPluginTree()`: after `collectPlugin()`, call each facet's `extract()` and `setFacet()`. Old monolithic fields still populated in parallel.
- Create `facets/core/index.ts` with `allFacets` registry array

**Verify**: Doc output byte-identical. Plugin-view API unchanged.

### Step 3: Remaining Facets (contributions, routes, resources, db-schema, cross-refs, registrations)

**Goal**: All metadata lives in facets. Monolithic fields are now redundant (but still populated).

- Create the remaining 6 facet plugins
- `contributions` facet merges static parsing + runtime enrichment from `enrichPluginTreeDocs()`
- `cross-refs` facet owns `apiUses` extraction (`parseServerApiUses`) and `importedBy` computation
- `routes.relate()` computes `endpointCallers`
- `db-schema.relate()` computes entity extension cross-refs (`extendedBy`)
- `registrations` facet extracts from imported `mod.default.register[]`
- `slots.relate()` computes `contributors` by reading `contributions` facet data from all plugins

**Verify**: Doc output byte-identical.

### Step 4: Unified Pipeline

**Goal**: `buildPluginTree()` uses the faceted pipeline. `enrichPluginTreeDocs()` is eliminated.

- Refactor `buildPluginTree()`: core field collection → import all barrels → extract all facets → assemble tree → relate all facets
- Remove `enrichPluginTreeDocs()` as a separate function. The tree is always enriched.
- Add `{ skipBarrelImport?: boolean }` escape hatch for callers that only need core fields (e.g. `plugin-registry-gen.ts`, `plugin-boundaries.ts` — they read only `dir`, `name`, `runtimes`, `path`)
- Backward-compat shim: populate old monolithic fields from facets (temporary)
- Update `buildEnrichedTree()` in `docgen.ts` to just call `buildPluginTree()`

**Callers of `buildPluginTree()` (all must still work)**:
- `docgen.ts` — uses enriched tree → works (now always enriched)
- `tree-handler.ts` — reads all fields → works via compat shim
- `compute-plugin-diff.ts` — reads slots, contributions, exports, routes, apiUses, resources, tables → works via compat shim
- `plugin-registry-gen.ts` — reads only dir/name/runtimes → pass `skipBarrelImport: true`
- `plugin-boundaries.ts` — reads dir/path/runtimes + apiUses → needs cross-refs facet, or `skipBarrelImport` + keep apiUses parse in core
- `runner.ts`, `no-reexport-default.ts`, `plugins-have-claudemd.ts`, `plugins-doc-in-sync.ts` — lightweight consumers → verify each

**Verify**: All `./singularity check` checks pass. Doc output identical.

### Step 5: Consumer Migration

**Goal**: All consumers read facets via `getFacet()`. No one reads old monolithic fields.

- `docgen.ts`: replace `renderPluginBody()` with a loop over `allFacets`, calling `facet.renderDoc(getFacet(node, facet.def), ctx)`
- `tree-handler.ts`: build the API `PluginNode` by reading facets. Delete `toApiNode()` and `buildSymbolConsumers()`.
- `compute-plugin-diff.ts`: read facets instead of `node.slots`, `node.exports`, etc.
- `config-origin-gen.ts`: read contributions facet instead of re-importing barrels

**Verify**: Doc output byte-identical. Plugin-view API JSON identical. `./singularity build` passes.

### Step 6: Cleanup

**Goal**: Remove all dead code and the backward-compat shim.

- Remove old monolithic fields from `PluginNode` (exports, slots, commands, contributions, server, central, webApiUses, coreApiUses, sharedApiUses, dbFiles, tables, importedBy, slotContributors, endpointCallers, entityExtensions, extendedBy, runtimeContributions, runtimeRegistrations)
- Remove backward-compat shim from `buildPluginTree()`
- Delete dead parsing helpers from `plugin-tree.ts` that were moved to facets
- Unify the API `PluginNode` type in `plugin-view/core/types.ts` — either import from `plugin-tree/core` or keep as a view model assembled from facets
- Delete `enrichPluginTreeDocs` export from `plugin-tree/core/index.ts`
- Remove stale type exports

**Verify**: Full build + all checks. No remaining references to old fields.

## Dependency Graph

```
Step 1 (foundation)
  └─ Step 2 (first 3 facets)
       └─ Step 3 (remaining 6 facets)
            └─ Step 4 (unified pipeline)
                 └─ Step 5 (consumer migration)
                      └─ Step 6 (cleanup)
```

## Key Files

| File | Role |
|------|------|
| `plugins/plugin-meta/plugins/plugin-tree/core/internal/plugin-tree.ts` | Tree builder (~1083 lines, major refactor target) |
| `plugins/framework/plugins/tooling/plugins/codegen/core/docgen.ts` | Markdown rendering (renderPluginBody → facet loop) |
| `plugins/plugin-meta/plugins/plugin-view/server/internal/tree-handler.ts` | API handler (toApiNode + buildSymbolConsumers → facet reads) |
| `plugins/plugin-meta/plugins/plugin-view/core/types.ts` | API PluginNode type (unify with core type) |
| `plugins/plugin-meta/plugins/barrel-import/core/internal/stubs.ts` | Bun stubs (wildcard replacement) |
| `plugins/review/plugins/plugin-changes/server/internal/compute-plugin-diff.ts` | Diff consumer (reads slots, exports, routes, etc.) |
| `plugins/framework/plugins/tooling/plugins/codegen/core/config-origin-gen.ts` | Config origin consumer |

## Risks

| Risk | Mitigation |
|------|-----------|
| Wildcard stub breaks a package needing structural fidelity | Keep React/web-sdk/config/database stubs explicit. Test all ~150 barrel imports. |
| Facet extract produces subtly different data than regex parsing | Byte-compare doc output at every step. |
| 2-3s import added to fast-path callers (checks, boundaries) | `skipBarrelImport` option for callers that only need core fields. |
| Facet inter-dependencies during relate() create ordering issues | All relate() runs after all extract() — facets read each other's Phase 1 data freely. |
| plugin-view UI depends on specific API PluginNode shape | Keep API shape stable through Step 5. Unify in Step 6. |

## Verification

At every step:
1. `./singularity build` succeeds
2. `diff` on `docs/plugins-compact.md`, `docs/plugins-details.md`, `docs/routes.md` — must be empty
3. Spot-check 2-3 per-plugin `CLAUDE.md` files for identical autogen blocks
4. Plugin-view API at `GET /api/plugin-view/tree` returns identical JSON (compare before/after)
5. `./singularity check` passes all checks
