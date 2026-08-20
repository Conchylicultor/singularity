# web-artifacts

Per-plugin web build artifacts: each plugin's `web/` barrel (and every imported
folder barrel — `core`, `fixtures`, …) builds into an independent,
content-addressed vite lib-mode artifact under `~/.singularity/cache/web-artifacts/`;
the compose step assembles `dist/` (inline import map + entry + preloads +
links into the store). This is the ONLY frontend build — the monolithic vite
build it replaced is gone (`web-core/vite.config.ts`, `--monolith`,
`SINGULARITY_WEB_MONOLITH`), so every dist producer runs this pipeline:
`./singularity build` (once per target namespace) and `./singularity build
--hermetic --composition <name…>` (the release path). Design/history:
`research/2026-07-15-global-per-plugin-web-artifacts.md`,
`research/2026-08-06-global-one-dist-per-namespace.md`.

Two knobs distinguish the producers, both passed to `runWebArtifactsPipeline`:

- **`source`** — WHICH fleet to plan. Omitted ⇒ the committed full registry; a
  composition MUST pass `compositionFleetSource({ root, name })` or it silently
  composes every plugin in the repo. Never `vendors` on the release path:
  `readFleetVendorMeta` throws unless the full non-composition fleet is already
  in this host's store, which a bare release host does not have; omitted, the
  pipeline resolves its own vendor set.
- **`materialize`** — real copies instead of store symlinks. Release only: its
  dist is copied into a shippable bundle, and it is written and read across a
  window where `.build.lock` is released, so a concurrent build's store pruning
  could dangle the links.

Key invariants:

- **Every emitted external import must resolve in the import map — and link.**
  Static imports and the registry's dynamic imports hard-fail the build on a
  miss. Other dynamic `@plugins/*` folder-barrel imports are composed into
  mapped, lazily-fetched artifacts by the barrel closure — EXCEPT kinds declared
  browser-unreachable (`BROWSER_UNREACHABLE_DYNAMIC_KINDS` in
  `core/constants.ts`, currently `prewarm`), which are skipped and silent.
  Any other unmapped dynamic import warns loudly at compose.
  Resolving is not enough: every name a static import binds must actually be
  exported by the target's emitted bytes, or the browser throws `SyntaxError:
  … does not provide an export named 'X'`. Because cross-plugin imports stay
  external and an importer's hash excludes its target's contents, renaming an
  export in B leaves A reused-unrebuilt and unexamined — compose is the only
  place the fleet's bytes are read against each other, so it hard-fails on a
  broken link too (`--skip-checks` included; `type-check` is skippable and
  casts/stale `.d.ts` typecheck green while the bytes disagree). Skipped as
  semantically unknowable: `import * as ns`, dynamic imports, and targets
  emitting `export *` (an incomplete export set — the fleet emits zero, and one
  appearing warns loudly rather than silently weakening the gate). Web barrels
  additionally must export `default`: the registry's loaders are dynamic and
  typed `Promise<{ default: unknown }>`, so nothing else catches its loss.
- **One URL = one module instance.** An import landing in one of the plugin's
  own non-inlined folders is rewritten to that folder's external
  `@plugins/<path>/<folder>` barrel (never inlined); vendors are one esbuild
  split build so stateful transitives are shared. Guarded by the
  `web-artifacts:no-vendored-state-inlined` check.
- **An artifact's address covers exactly what its bytes inline.** The store
  reuses an artifact whenever its address matches, so any source file whose
  content reaches the bundle but not the hash fossilises the artifact: it is
  served forever against sibling code it was never built with. The inlined-folder
  set is therefore ONE list (`inlinedRootsFor` in `core/own-roots.ts`, `[kind,
  "shared"]`), read by both the address side (`listOwnFiles`) and the content
  side (the externals predicate + the own-folder-barrel rewrite); every other own
  folder is external, routed to its own barrel. Backed by an assert that trusts
  neither: `createInlineAudit` reads the module ids rollup actually emitted
  (`generateBundle`) and hard-fails on any first-party file outside the hashed
  roots. Before this, a `fixtures` barrel inlined its plugin's whole `web/` while
  hashing only `fixtures/` — moving an export out of a sibling plugin surfaced as
  a compose link failure against an hour-old fossil, and the `prewarm` barrels
  inlined an unhashed `shared/` (`…/mirror`) the same way.
  (`research/2026-08-17-global-artifact-address-covers-content.md`)
- **A dist names itself by its content, not by its run.** Compose injects two
  globals into `index.html` — `__SINGULARITY_GRAPH__` (`computeGraphHash`: a pure
  function of the import map, entry, global CSS and preload closure, every one of
  them already content-addressed) and `__SINGULARITY_COMMIT__` (the tree the
  caller sampled BEFORE it read a source file). The graph hash is what the
  caller writes to `.build-graph` and what a tab compares itself against, so two
  builds of an unchanged tree don't ask every open tab to reload. The run id
  (`buildId`) stays out of the bundle: it changes on every build by construction,
  which is exactly what made the old `__SINGULARITY_BUILD_ID__` nonce useless as
  an identity — and it also gave every compose-serve composition the SAME pin
  despite each composing a different closure.
- **Expected vs deployed cannot drift**: the pipeline and the
  `web-artifacts:map-in-sync` check share the same planning code
  (`core/internal/plan.ts`).
- **Ground truth is verified independently of the planner.** Because the map
  assembly and the metadata-based coverage check share one scanner, a scanner
  blind spot makes both wrong identically (the unscanned-`.mjs`-chunks outage:
  specifiers imported only by a lazy chunk got no vendor/map entry and the
  build passed). Compose therefore ends with `scanStagedModules`
  (`core/internal/staged-verify.ts`): re-lex every staged `.js`/`.mjs` file the
  browser will actually fetch and hard-fail on any unresolvable import.
- **Builder edits auto-invalidate the fleet.** The builder identity hashes this
  plugin's own `core/` source (`builderSourceDigest`), and the vendor-set key
  includes it too — changing scanner/compose/vite/vendor semantics can never
  silently reuse stale artifacts. `BUILDER_VERSION` remains only as a forced-bump
  lever.
- **The global CSS pass never auto-scans the vite root.** app.css imports
  Tailwind with `source(none)`, so the scan surface is exactly its declared
  `@source` dirs. The pass builds with the repo root as vite root, and
  auto-detection from there walked `.claude/worktrees/` on the main checkout
  (~90 checkouts, millions of files; oxide's walkdir ignores `.gitignore`) —
  ~5s became ~320s. Enforced by `tailwind-scan-covers-classes`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Per-plugin web build artifacts: content-addressed vite lib-mode builds composed via an import map
- Core:
  - Uses:
    - `framework/web-core.findViteContributions`
    - `framework/web-core.loadBabelContributions`
    - `infra/namespace.MAIN_COMPOSITION_ID`
    - `packages/semaphore.createSemaphore`
  - Exports (types):
    - `ArtifactKind`
    - `FleetSource`
    - `ImportMapEntry`
    - `OwnFile`
    - `VendorSetMeta`
    - `WebArtifactsPipelineOptions`
    - `WebArtifactsPipelineResult`
  - Exports (values):
    - `barrelKindOf`
    - `BROWSER_UNREACHABLE_DYNAMIC_KINDS`
    - `BUILDER_VERSION`
    - `buildImportMap`
    - `compositionFleetSource`
    - `computeIdentityHash`
    - `computeInputsHash`
    - `computeOwnHash`
    - `computePreloadClosure`
    - `defaultFleetSource`
    - `findUnmappedDynamicWarnings`
    - `findUnmappedSpecifiers`
    - `firstSegmentOf`
    - `FORCED_VENDOR_SPECS`
    - `INLINE_PACKAGES`
    - `inlinedRootsFor`
    - `isBareSpecifier`
    - `isBrowserUnreachableDynamic`
    - `isInlinedPackage`
    - `makeArtifactExternal`
    - `packageNameOf`
    - `readFleetVendorMeta`
    - `runWebArtifactsPipeline`
    - `sha256Hex`
    - `SHARED_ROOT`

<!-- AUTOGENERATED:END -->
