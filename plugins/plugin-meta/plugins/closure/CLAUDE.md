# closure

The **plugin closure engine** — a pure, browser-safe core-only library that
computes which plugins a *composition* bundles, and *why*. A composition is a
named, **conservative** selection over the plugin space:
`{ name, entryPoints, selectedContributors, extends? }` (`CompositionManifest`).
Sibling of `plugin-tree` / `facets` / `plugin-view` under the `plugin-meta`
umbrella; core-only like `plugin-tree` (no web/server runtime, no `definePlugin`).

## `extends` — first-class composition references (`flattenManifest`)

`extends` lists other composition NAMES (typically **packs** — reusable,
entry-less contributor sets) whose `entryPoints` + `selectedContributors` are
unioned into the host, **transitively**. `flattenManifest(manifest, registry)`
folds the chain into a single flat manifest (`extends: []`) before any
resolution: it is diamond/cycle-safe (a `visited` set over names), dedupes, and
ignores unknown references inertly — exactly mirroring how unknown plugin ids
flow inertly through `expandEntrySeeds`. Purely additive: a pack can only add
options, never replace or redirect, so composing stays a union/hard-closure with
no precedence. **Every engine entry point (`resolveComposition`, the causality
queries, the `composition-closure` check) operates on an already-flattened
manifest** — callers flatten first; the core never re-walks `extends`.

**Conservative opt-IN model — NOTHING soft is included by default.** The bundle
is the hard closure of (entries ∪ explicitly selected contributors). Soft
contributors are *options* a human/agent reviews and selects; they are never
auto-activated. There is no enhancement/registration distinction, and no
fixpoint loop.

This is the one load-bearing piece of the [Plugin Compositions
vision](../../../../research/2026-06-09-global-plugin-compositions.md) — every
later increment (Studio tint, composition diff, the `composition-closure`
validity check, build-gating) builds on it. Designed in
[`research/2026-06-09-global-plugin-closure-engine.md`](../../../../research/2026-06-09-global-plugin-closure-engine.md).

## Pure & browser-safe — no disk, no barrels

Every input is read from per-node **facet data** already serialized into the
tree (`node.facets[id]`, via `getFacet`). No `fs`, no `path`, no barrel imports.
It runs identically at build time, at the existing `GET /api/plugin-view/tree`
endpoint, and (future) client-side in Studio. `buildPluginTree(...,
{ skipBarrelImport: true })` populates everything the engine consumes.

## Edge classification (`classifyEdges`)

Two edge kinds, both indexed forward + reverse:

- **hard** (mandatory, unprunable) — `A → B` when A *imports* B, read from the
  `cross-refs` facet's per-runtime `apiUses` (unioned across runtimes, self-edges
  dropped; precise & nested-aware). Importing an umbrella's barrel does **not**
  pull its children — the barrel re-exports the umbrella's own symbols.
- **soft** (prunable) — `A → B` when A *contributes* to a slot **group** B owns.
  Slot ownership comes from the `slots` facet (`groupName`, first-writer-wins,
  `_runtimeOnly` slots skipped); contributions from `contributions.static`
  (`slot.split(".")[0]` is the PascalCase group symbol). This mirrors
  `contributions.relate()` exactly, but keyed by `PluginId` (not `node.name`).

`EdgeGraph` also carries `subtree` (node → descendant ids). **Containment is NOT
a dependency edge** — it is applied only at *entry seeding*: selecting an
umbrella *as an entry* ships its whole subtree; merely importing it does not.
This is why `apps.agent-manager` (a no-runtime umbrella) correctly bundles its
runtime-bearing `…​.shell` sub-plugin without dragging in every sibling app that
shares the `apps` barrel.

## Resolution (`resolveComposition`)

Single pass, **no fixpoint loop, no auto-activation**:

```
entrySeeds = expandEntrySeeds(entryPoints)            // umbrella entry ships its subtree
required   = hardClosure(entrySeeds)                  // entries alone — the locked set
bundle     = hardClosure(entrySeeds ∪ selectedContributors)
```

With the default `selectedContributors: []`, `bundle === required` — a small,
purely-hard bundle. Reviewing a composition means recursively *selecting* options
from the `available` frontier; each selection re-resolves, adding the selected
contributor and its hard closure.

`available = { A : A ∉ bundle, and A soft-contributes to some B ∈ bundle }` —
the reviewable option frontier (`softReverse` over the bundle, minus bundle
members; sorted + deduped). These nodes carry membership `available`.

**Membership** (total over every tree node; in-bundle precedence
`entry > required > contributor > via-contributor`, default `excluded`):

| state | meaning |
|---|---|
| `entry` | explicitly in `entryPoints` |
| `required` | in `hardClosure(entrySeeds)` — locked, not removable |
| `contributor` | a SELECTED contributor that's in the bundle (not entry/required) |
| `via-contributor` | bundled only via a selected contributor's hard closure |
| `available` | NOT bundled, but soft-contributes to the bundle — a reviewable option |
| `excluded` | not bundled and not a reviewable option |

`redundantSelections = selectedContributors ∩ (required ∪ entries)` — a selection
already locked in by hard edges, so it's a no-op worth surfacing in review.

## Causality queries

- `explainInclusion(graph, manifest, target)` → shortest "why bundled": BFS over
  `hardReverse` from `target` back to the seed frontier (expanded entries ∪
  selected contributors), entry-origin preferred. A selected-contributor origin
  prepends its soft edge. `null` if `target` is not bundled.
- `impactOfPruning(graph, manifest, selection)` → `bundle(with) \ bundle(with
  `selection` deselected)`, sorted — the cost of DESELECTING an option. Empty for a
  hard-locked (`entry`/`required`) or unselected node — deselecting drops nothing.
- `impactOfSelecting(graph, manifest, candidate)` → `bundle(with `candidate`
  selected) \ bundle(without)`, sorted — the cost of ADDING an option: `candidate`
  plus everything its hard closure newly pulls in. The review affordance. Empty if
  `candidate` is already bundled.

## Out of scope (deferred increments)

- The `composition-closure` **check** and the **manifest registry**
  (`defineCollectedDir("composition")`). The engine defines the
  `CompositionManifest` *type* (its input); the registry that discovers manifests
  is the next increment. Until then the check would iterate an empty set.
- Studio visualization; per-runtime split (the unioned graph is v1).

## Tests

`core/closure.test.ts` runs `buildPluginTree` + `classifyEdges` +
`resolveComposition` against the **real** tree for the `agent-manager`
composition. Under the conservative model: the default bundle is small (16/512 —
hard closure of the entries alone), `shell` is `required`, the whole
`apps.sonata.*` subtree is OUT of the bundle (`excluded`/`available`), the
`available` frontier is non-empty (57 options), selecting an `available` id
(`review`) pulls it in as `contributor` with a non-empty `impactOfSelecting`,
selecting a `required` node surfaces in `redundantSelections`, plus total
membership, an all-hard `explainInclusion` path, and `impactOfPruning(required)`
empty. Run with
`bun test plugins/plugin-meta/plugins/closure/core/closure.test.ts`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Uses: `plugin-meta/facets.getFacet`, `plugin-meta/facets/contributions.contributionsFacetDef`, `plugin-meta/facets/cross-refs.crossRefsFacetDef`, `plugin-meta/facets/slots.slotsFacetDef`
  - Exports: Types: `Composition`, `CompositionManifest`, `Edge`, `EdgeGraph`, `EdgeKind`, `InclusionPath`, `InclusionStep`, `MembershipState`, `SerializedEdgeGraph`; Values: `classifyEdges`, `deserializeEdgeGraph`, `disabledClosure`, `explainInclusion`, `flattenManifest`, `hardClosure`, `impactOfPruning`, `impactOfSelecting`, `resolveComposition`, `serializeEdgeGraph`
- Cross-plugin:
  - Imported by: `framework/tooling/codegen`

<!-- AUTOGENERATED:END -->
