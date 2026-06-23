# composition

The **composition manifest registry** — owns the named compositions of the repo
as runtime-editable data. A composition is a `CompositionManifest`
(`{ name, entryPoints, selectedContributors, extends? }`, **owned by and imported
from** [`closure`](../closure/CLAUDE.md) — never redefined here) plus a
`category` (organisation metadata only — `app | profile | subsystem | pack`,
NOT consumed by the engine); this plugin is the *registry* that stores them, the
engine is the algorithm that resolves them. Sibling of `closure` / `plugin-tree`
/ `facets` under `plugin-meta`; ships `core` / `web` / `server` barrels.

## Taxonomy & seeds

The config `default` seeds the whole repo's compositions, grouped by `category`:
**app** (one lean baseline per top-level `Apps.App`, entry = the app shell
umbrella), **profile** (variants of one app along the self-improvement axis — the
worked example is `agent-manager` full vs. `agent-manager-lean`), **subsystem**
(infra closures used as building blocks / inspection lenses — `data`,
`jobs-events`, `live-state`, `auth`, …), and **pack** (entry-less contributor
SETs apps opt into via `extends`; `self-improvement` is the pack the
agent-manager profile pulls in). The full bundle is never enforced at runtime
yet — compositions remain a Studio inspection concept; releasing/runtime-gating
is future work.

## Manifests are a config_v2 config — no codegen

Manifests live in a [`config_v2`](../../../config_v2/CLAUDE.md) config named
`compositions` (`core/config.ts`, `defineConfig` + a `listField` of
`{ name, category (enum), entryPoints (string-list), selectedContributors
(string-list), extends (string-list) }`, `promotableToGit: true`). This replaces
the former collected-dir / barrel registry: there is **no**
`composition.generated.ts`, `loadCompositions()`, or
`<plugin>/composition/index.ts` — creating or editing a manifest is now a plain
runtime write, no `./singularity build` required.

The config's `default` seeds the full repo taxonomy (apps / profiles /
subsystems / packs — see above). The agent-manager anchor demo is the
`profile` pair: a full `agent-manager` that `extends: ["self-improvement"]` and
an `agent-manager-lean` that does not, so the flattened full \ lean contributor
difference is exactly the self-improvement pack. Each seed carries an **explicit
stable `id` + `rank`** (the list field only auto-injects those on UI "Add"), so
seeded rows are editable and ordered; ranks are the leading fractional-index
keys (`"a0"`, `"a1"`, `"a2"`, …).

Because config_v2 carries a built-in **git layer** (committed default) and
**user layer** (runtime override), a manifest set edited in the UI lands in the
per-worktree user config; promoting it to a committed default is the filed
`promotableToGit` follow-up.

- `core/config.ts` — the `compositionsConfig` descriptor (core-safe: imported by
  web, server, and the future build-time check).
- `core/manifest-map.ts` — `manifestItemToManifest(item)` drops the list `id` /
  `rank` and the engine-opaque `category`, carries `extends` through verbatim,
  and casts the id arrays to `PluginId[]` at the config boundary, plus the
  `CompositionManifestItem` type (a manifest + `category` + its `id` / `rank`).
- `server/index.ts` registers the config (`ConfigV2.Register`); `web/index.ts`
  registers it on the client (`ConfigV2.WebRegister`).

## Override is forbidden — by construction

The manifest vocabulary is **additive only** (`entryPoints`,
`selectedContributors`, and `extends` — which only unions in another
composition's additive vocabulary). There is no field that replaces or redirects
a plugin's file, so override is *inexpressible*; resolution is a pure union /
hard-closure with no precedence rules. The `composition-closure` check
(`framework/tooling/checks`) adds validity (ids resolve, names unique, every
selection is a genuine load-bearing soft option) by reading the committed
git-layer config off disk — runtime-only (user-layer) manifests are not
closure-checked until promoted to git.

## Studio data: server + web runtimes

Beyond the registry, this plugin ships the **Studio closure data**:

- **`server/`** implements `GET /api/composition/data` (`core/endpoints.ts`):
  builds + classifies the plugin tree **once per process** (module-cached), then
  returns `{ graph: SerializedEdgeGraph, allIds }` — code-derived structure only.
  Manifests are **not** on this endpoint; they are user data read client-side
  from the `compositions` config. The graph is serialized via `closure/core`'s
  `serializeEdgeGraph` so it crosses the wire as plain JSON; the
  membership/inclusion/impact algorithms then run entirely client-side.
  Tree-build staleness across a live plugin change is a filed follow-up
  (invalidate on the git-watcher signal if it ever matters).
- **`web/`** owns the **manifest read/write API** over the config:
  `useManifestItems()` returns the raw config items (`{ id, rank, name,
  entryPoints, selectedContributors }[]`) for the Studio list + editing;
  `useManifestActions()` returns `{ save(draft, editingId?), remove(id) }` built
  on `useSetConfig` — `save` upserts (replace by `editingId`, else append a new
  item with a fresh `id` + `rank` via `crypto.randomUUID()` + `Rank.between`,
  mirroring the `list` field renderer). Consumers go through this API so they
  never touch `config_v2` directly (collection-consumer separation).
- **`web/`** also exposes `useCompositionData()` (fetch + deserialize-once,
  sourcing `manifests` from `useManifestItems()` mapped through
  `manifestItemToManifest`, so engine consumers keep their `CompositionManifest[]`
  shape) and the
  module-level **active-composition store** (`useSyncExternalStore`): the working
  DRAFT `CompositionManifest`, with `setActiveComposition` / `pinAsRoot` /
  `updateActiveDraft` / `clearActive`, plus a derived `useActiveMembership()` map
  recomputed exactly **once per (active, graph) change** (not per row). Causality
  hooks `useInclusion(node)` / `useImpact(node)` wrap the engine's
  `explainInclusion` / `impact*` against the active draft. Studio sub-plugins and
  `plugin-view` import these from `composition/web`.
- **Compare slot (Increment 3).** The store also holds a second
  `compareWith: CompositionManifest | null` (`setCompareComposition`,
  `useCompareComposition`). When BOTH active and compareWith are set
  (`useIsCompareMode()` → true), `useDiffMap()` returns a
  `Map<PluginId, DiffState>` (`"only-a" | "only-b" | "both" | "neither"`) derived
  exactly **once per (active, compareWith, graph) change** by comparing the two
  `resolveComposition(graph, …).bundle` sets: in both → `both`, only active(A) →
  `only-a`, only compareWith(B) → `only-b`, else `neither`. `useDiffMap()` is
  `null` outside compare mode, so the single-composition membership path is
  untouched. `clearActive()` clears the compare slot too.

## Tests

`core/config.test.ts` is pure logic (no generated registry, no server): it
asserts the config `default` seeds parse against the descriptor schema, that the
taxonomy is populated (app / profile / subsystem / pack), each seed maps to a
valid `CompositionManifest` via `manifestItemToManifest` (only packs may omit
entry points), the `self-improvement` pack holds exactly the self-improvement
set, and that the **flattened** agent-manager full-vs-lean `selectedContributors`
difference (via `flattenManifest`) is exactly that pack. Run with
`bun test plugins/plugin-meta/plugins/composition/core/config.test.ts`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Web hooks + active-composition store for the Studio closure visualization: fetches and deserializes the edge graph once, holds the working draft, and derives membership / inclusion / impact client-side. Owns the manifest read/write API over the compositions config_v2 config. Serves the classified edge graph for the Studio closure visualization; registers the runtime-editable compositions config.
- Web:
  - Contributes: `ConfigV2.WebRegister`
  - Uses: `config_v2.ConfigV2`, `config_v2.useConfig`, `config_v2.useConfigRegistrations`, `config_v2.useSetConfig`, `config_v2/staging.useStageConfigDefault`, `infra/endpoints.useEndpoint`
  - Exports: Types: `CompositionDataResult`, `DiffState`, `ImpactResult`, `ManifestActions`, `PromoteManifestsToGit`; Values: `clearActive`, `pinAsRoot`, `setActiveComposition`, `setCompareComposition`, `updateActiveDraft`, `useActiveComposition`, `useActiveMembership`, `useCompareComposition`, `useCompositionData`, `useDiffMap`, `useEnsureCompositionData`, `useGraph`, `useImpact`, `useInclusion`, `useIsCompareMode`, `useManifestActions`, `useManifestItems`, `usePromoteManifestsToGit`
- Server:
  - Uses: `config_v2.ConfigV2`, `infra/endpoints.implement`, `infra/paths.PLUGINS_DIR`
  - Routes: `GET /api/composition/data`
- Core:
  - Uses: `config_v2.defineConfig`, `fields/enum/config.enumField`, `fields/list/config.listField`, `fields/string-list/config.stringListField`, `fields/text/config.textField`, `infra/endpoints.defineEndpoint`, `plugin-meta/closure.flattenManifest`
  - Exports: Types: `CompositionData`, `CompositionManifestItem`; Values: `compositionDataSchema`, `compositionsConfig`, `getCompositionData`, `manifestItemToManifest`
- Cross-plugin:
  - Imported by: `apps/studio/compositions`, `apps/studio/explorer/membership`, `apps/studio/graph`, `plugin-meta/plugin-view/dependencies`, `plugin-meta/plugin-view/inclusion`

<!-- AUTOGENERATED:END -->
