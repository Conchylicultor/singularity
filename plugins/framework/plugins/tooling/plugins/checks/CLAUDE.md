# checks

A check that detects a code pattern by scanning source text MUST NOT match
inside comments or string literals. Use **`grepCode`** (exported from
`checks/core`) instead of a bare `git grep`: it narrows candidate files with
`git grep -l`, then masks each via `maskSource` and re-scans, so only real-code
matches survive. Pick `maskStrings: false` when the banned token legitimately
lives in a string (e.g. `text/event-stream`, `/api/…` URLs, hardcoded paths);
`true` for code constructs (`new WebSocket(`, casts). See
[`parse-utils`](../../../../plugin-meta/plugins/parse-utils/CLAUDE.md).

A check that parses each candidate file (AST) rather than regex-scanning its
lines MUST get its candidate sources from **`listCandidateSources`** (exported
from `checks/core`), never a bare `git grep`. `git grep` searches only
**tracked** files, so a newly-created, not-yet-committed source is invisible to
it — the exact file an agent produces when adding a pane/route/endpoint, which
would then slip past the check and only fail at runtime. `listCandidateSources`
is scan-tree-aware and untracked-aware (it shares the discovery plumbing behind
`grepCode`/`grepImports`), so it sees those uncommitted files.

## A `scope: "tree"` verdict must not depend on the process that produced it

A passing check writes an entry to the shared cache under
`~/.singularity/check-cache/`, and a later run in a different process (usually
`./singularity push`) returns ✓ off that entry without running anything. So a
recorded PASS must be **transferable**: the process that reads it has to be able
to reproduce it.

That is why `scope: "tree"` means more than "a function of the tree hash". The
verdict must also be independent of what else already ran in the same process.
Depend on process history and the reader cannot reproduce the verdict — and has
no way to notice, so it just returns the green.

How `plugins-doc-in-sync` got this wrong: `reorder`'s `contributions` array
starts empty and is filled by a `subscribeSlotsDeclared` callback. Inside a build
the slot-declaration pass runs during codegen, so the check read the full set; in
a standalone check pass it read none. Four builds each recorded a pass, four
pushes trusted it, and a `docs/plugins-details.md` only a build could reproduce
shipped across four commits.

Commit `18126884a` fixed it. Copy both halves — neither is optional:

- **Move the precondition into the producer.** `buildEnrichedTree`
  ([`codegen/core/enriched-tree.ts`](../codegen/core/enriched-tree.ts)) runs the
  declaration pass itself, memoized per root. It used to live in one caller's
  pipeline ordering, where it held for that pipeline and nowhere else.
- **Make the early read throw.** `slotDeclarationPasses()` in
  [`slot-declaration/core/declaration.ts`](../../../slot-declaration/core/declaration.ts)
  counts completed passes, and the contributions facet refuses to extract while
  it is zero. A **count**, not `owners.size > 0`, so a pass over plugins that
  declare no slots is not mistaken for a pass that never ran. Without the throw,
  reading too early returns a smaller answer that looks correct — which is how
  this shipped.

`cacheSignature()` follows the same reasoning: a signature keys a verdict, it
cannot make one reproducible. If the verdict depends on something outside the
checkout and outside the signature, the right value is `null`, and the repair is
to remove the dependency rather than key around it.

## `runChecks()` has exactly one in-process caller

[`cli/bin/commands/check.ts`](../../../cli/bin/commands/check.ts), the `check`
command's own action. `build` and `push` both reach it by spawning that command.

A build process has already imported every plugin barrel, run the
slot-declaration pass, and warmed the codegen memos, so entries it recorded
in-process would carry all of that as invisible context — and the clean
subprocess push spawns would then hit those entries and skip the run it paid
for. Spawning makes build's ✓ and push's ✓ the same claim by construction. Held
by the `check-runner-safety` lint rule (bans the `runChecks` value import
elsewhere) plus a throw in `runChecks` when `isBuildProcess()`.

## `inputKeyed` carries an extra rule

Live, not a dormant scaffold — nine checks set it: `type-check`,
`plugin-boundaries`, `active-data`, `no-raw-event-source`, `no-raw-sse`,
`no-raw-websocket`, `no-hardcoded-colors`, `no-hand-built-link-to`,
`no-use-resource-cast`.

The read-set slot is keyed on `(checkId, cacheSignature())` with **no tree hash
at all** (`readSetFile` in [`core/cache.ts`](core/cache.ts)), so a PASS recorded
there survives forward into later trees for as long as the replay still
validates. A wrong answer on the tree-hash slot is confined to the one tree it
was recorded against; here nothing bounds it. **A check that is not a pure
function of the checkout must never be moved onto this flag** — fix the impurity
at its source first.

Three checks document why they stay off it; read them before adopting:
[`format-clean`](plugins/format-clean/check/index.ts) and
[`lint-directives-stable`](plugins/lint-directives-stable/check/index.ts) start
from a `git merge-base` read the recording view cannot observe, and
[`test-layout:runner-split`](../test-layout/check/index.ts) discovers files via
`git ls-files` and reads `bunfig.toml` / `vitest.config.ts` directly.

## Bumping the cache-key format version

Slot names carry `CACHE_KEY_VERSION` ([`core/cache.ts`](core/cache.ts)). Bump it
when the **meaning** of a recorded entry changes but its key would not — e.g.
entries recorded under a weaker guarantee must stop being trusted.

Never bump for a change in check logic: `ReadSet.sourceHash` covers that (it
hashes the check-system source, rides inside the read-set payload, and is
verified on read). It cannot help the legacy slot, whose `has()` is a bare
`existsSync` that never opens the file — renaming is the only way to retire one.
Never revert a bump either: returning to a retired version re-addresses the
entries it was raised to abandon. To undo `v2`, go to `v3`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Check runner and built-in checks for ./singularity check
- Core:
  - Uses:
    - `framework/tooling/collected-dir.defineCollectedDir`
    - `framework/tooling/collected-dir.loadCollectedDir`
    - `infra/file-sink.defineFileSink`
    - `infra/paths.pruneWorktreeCheckArtifacts`
    - `infra/paths.REPO_ROOT`
    - `infra/paths.worktreeArtifacts`
    - `infra/spawn.getWorktreeRoot`
    - `infra/spawn.spawnCaptured`
    - `plugin-meta/parse-utils.findImports`
    - `plugin-meta/parse-utils.lineAt`
    - `plugin-meta/parse-utils.maskSource`
    - `plugin-meta/plugin-tree.buildPluginTree`
  - Exports (types):
    - `CandidateSource`
    - `CheckCache`
    - `CheckRunProgress`
    - `CodeMatch`
    - `DirFact`
    - `FileFact`
    - `FileSystemView`
    - `GlobFact`
    - `ImportMatch`
    - `ListCandidateSourcesOptions`
    - `OutstandingCheck`
    - `ProgressRecord`
    - `QueryFact`
    - `ReadSet`
    - `RunChecksOptions`
    - `TreeSnapshot`
    - `TscTarget`
    - `ValidateOptions`
    - `ValidateResult`
  - Exports (values):
    - `checkCollectedDir`
    - `computeCheckSourceHash`
    - `computeTreeHash`
    - `currentScanView`
    - `discoverTscTargets`
    - `fingerprint`
    - `gitGrepList`
    - `grepCode`
    - `grepImports`
    - `isBuildInProgress`
    - `isBuildProcess`
    - `listAllChecks`
    - `listCandidateSources`
    - `loadTreeSnapshot`
    - `markBuildInProgress`
    - `materializeWarmBase`
    - `openCheckCache`
    - `publishWarmBase`
    - `readCheckProgress`
    - `runChecks`
    - `scopeOf`
    - `tsBuildInfoPath`
    - `validate`
- Sub-plugins:
  - **`app-css-utilities-in-sync`**
  - **`barrel-stubs-in-sync`**
  - **`class-token-walk-in-sync`**
  - **`collected-dir-tsconfig-coverage`**
  - **`composition-closure`**
  - **`config-origins-in-sync`**
  - **`config-stable-list-ids`**
  - **`conversation-trailer`**
  - **`css-vars-single-owner`**
  - **`css-vars-supplied`**
  - **`data-migration-dml-only`**
  - **`data-views-in-sync`**
  - **`durable-signals-accounted`**
  - **`eager-tier-in-sync`**
  - **`fields-eager-in-sync`**
  - **`format-clean`**
  - **`generated-artifacts-normalized`**
  - **`host-budget`**
  - **`host-pools-declared`**
  - **`inherited-theme-defaults-scoped`**
  - **`keyed-resource-scope`**
  - **`lint-directives-stable`**
  - **`migration-hashes-unique`**
  - **`migration-metadata-consistent`**
  - **`migrations-in-sync`**
  - **`no-db-backed-notify`**
  - **`no-hand-built-link-to`**
  - **`no-hardcoded-colors`**
  - **`no-plugin-imports-in-core`**
  - **`no-plugin-workspace-deps`**
  - **`no-raw-event-source`**
  - **`no-raw-sse`**
  - **`no-raw-websocket`**
  - **`no-reexport-default`**
  - **`no-relative-server-imports`**
  - **`no-use-resource-cast`**
  - **`plugin-boundaries`**
  - **`plugin-refs-resolve`**
  - **`plugins-doc-in-sync`**
  - **`plugins-have-claudemd`**
  - **`plugins-registry-in-sync`**
  - **`pre-barrel-manifests-complete`**
  - **`reorderable-slots-in-sync`**
  - **`snapshot-chain-intact`**
  - **`table-defs-in-schema-glob`**
  - **`tailwind-scan-covers-classes`**
  - **`token-group-vars-in-sync`**
  - **`tsconfig-alias-single-owner`**
  - **`type-check`**

<!-- AUTOGENERATED:END -->
