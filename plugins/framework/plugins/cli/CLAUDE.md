# cli

The `./singularity` agent CLI. `bin/index.ts` is a three-step bootstrap;
`bin/cli.ts` is the CLI proper and registers one command per file under
`bin/commands/`. Everything shared between commands lives either beside them in
`bin/` (profiler, build lock, lane, migrations, admission valve, ensure-deps) or,
when it is an ordered *stage sequence* rather than a helper, in
`bin/commands/internal/`.

## Commands

| command | what it does |
|---|---|
| `build` | **Deploy this checkout into the live dev cluster.** The inner loop: artifacts + Postgres readiness, the worktree DB fork, the `build_runs` ledger, gateway spec/restart/health probe, compose-serve. Needs a provisioned dev box. |
| `build-composition` | **Produce one composition's artifact set, hermetically.** Filtered registries + generated migration SQL + the web dist, as a function of (source tree, composition) only. No cluster, no gateway, no ledger — runs on a bare host from a fresh `git clone`. |
| `release` | Wraps `build-composition` and packs its output into a portable self-contained app (`--target web` / `tauri`). |
| `check` | Run the repo validation checks (also the first step of `push`, and mid-`build`). |
| `test` | Run tests under the given paths (default: whole `plugins` tree) through **both** runners sequentially (`bun test`, then `vitest run`), then summarize both buckets — an empty one is stated, not implied, because either runner alone is green-but-partial. Paths only; no flag forwarding. |
| `push` | Checks → merge the worktree branch back into main → push. |
| `regen-generated` / `regen-migrations` | The repo-tree codegen and migration-generation pipelines as standalone commands (used by the normalize pass). |
| `normalize-generated` | Marker-gated repair of generated artifacts a merge driver auto-resolved. Invoked by the `post-rewrite` hook; rarely run by hand. |
| `apply-migrations` / `serve-app` | Runtime entrypoints a released bundle's launcher invokes. |
| `db` / `start` | DB fork/list/drop admin, and the one-time gateway bring-up. |

`build`, `check` and `push` are the **op commands** (`orphan-guard.ts`'s
`OP_COMMANDS`): long-running and host-lock-holding, so they install the orphan
guard, which exits the op once its invoking shell dies — an orphaned op must
never sit on a host lock (the push mutex, worst case). That is now the *only*
effect of membership. Nothing else is an op command; `build-composition` is
deliberately absent, see its docblock.

Op commands used to additionally re-exec themselves under `bun --inspect` so the
op-wedge watchdog could attach a profiler. Both the watchdog and the re-exec were
removed 2026-07-28 (every wedge the watchdog ever reported was a false positive —
`research/2026-07-28-global-retire-op-wedge-watchdog.md`), so an op is now a
single process, not a wrapper/worker pair.

## Generated artifacts across a merge

`.gitattributes` routes every generated file (registries, plugin docs, plugin
`CLAUDE.md` autogen blocks, config origins, drizzle migrations) to a merge driver
in `scripts/`. A driver does the CHEAP half — take the upstream side, drop a
marker in `$GITDIR/singularity-merge-markers/` — because the file is a pure
function of sources git just merged correctly. `bin/git/normalize-generated.ts`
is the other half: re-derive from the merged tree, amend, consume the marker.

It is deliberately NOT push-owned. `.githooks/post-rewrite` runs it after any
rebase (so a manual `git rebase origin/main` self-heals), `push` runs it around
its own rebase with the hook suppressed (`SINGULARITY_SKIP_POST_REWRITE`, because
push installs the rebased lockfile first), and `build` reaches the same state by
regenerating everything and clearing the markers itself. `core/` holds the marker
names + conflict scan so the `generated-artifacts-normalized` check reads the
same facts.

**`data/meta/_journal.json` is derived but stays TRACKED, on purpose.** A merge
driver only runs when a path is modified on both sides. Every other artifact
under the `regen-migrations` patterns is named `<ts>_<sha8>__<slug>`, so two
branches never touch the same one — the journal is the only file every migration
appends to, and therefore the only thing that fires the `migrations` marker.
"Both sides added a migration" ⇔ "journal both-modified" ⇔ "a snapshot-chain
Y-fork is possible", which is exactly the predicate the `--reset-migration`
repair needs. Gitignore it and the entire migration normalization pass stops
running (and drizzle-kit silently recreates an empty one). It does NOT cover
schema drift — main changing `schema.ts` without a migration is one-sided;
`migrations-in-sync` is what fails there.

## Dependencies: `bin/ensure-deps.ts` is the only install

`ensureDeps()` owns "this checkout's `node_modules` is correct for its inputs":
freshness-gated on a `(mtimeMs,size)` signature stamped in
`node_modules/.singularity-deps` (so the common case is ~140 ms and silent),
serialized on `.install.lock`, and **loud** — it runs `bun install` with output
passed through and throws a message naming the phase on failure. Every install
site routes through it: the `bin/index.ts` bootstrap, `mise.toml`'s setup task,
and `app-artifacts.ts` stage 1.

**`./singularity` is a bare `exec` — never add a step above it.** It used to run
`bun install --silent` first; a failed install (bun 1.3.13 has no install mutex,
so concurrent installs in one checkout race on `clonefileat`) aborted the wrapper
under `set -e` before `exec`, printing nothing, so *every* subcommand read as
having failed on its own. Nothing may run before the CLI process, because only
the CLI process can attribute its own failures.

**`bin/index.ts` may never statically import an npm package** — node builtins,
relative files and `@plugins/*` only. Static imports hoist above the install, so
`import { program } from "commander"` there would resolve against the
`node_modules` `ensureDeps` exists to repair. That is the whole reason `cli.ts`
exists and why the bootstrap ends in `await import("./cli")`; the orphan guard
arms first, so an orphaned op can never sit on the install lock. Enforced by the
`cli:bootstrap-package-free` check — if you need a package, put it in `cli.ts`.

Lock order is one-way: **`.build.lock` → `.install.lock`**, never the reverse
(nothing takes the build lock while holding the install lock), so no deadlock.
The install lock is not `.build.lock` itself on purpose — sharing them would make
a `./singularity check` block for an entire concurrent build.

## The artifact / deploy seam

`build` used to be the only way to produce a composition, via a `--composition`
flag — so cutting a release required a machine that was already a Singularity dev
box, and the artifact was a function of the developer's environment rather than
of the source. That flag is **gone**; `build-composition` replaced it.

The ordered pipeline both commands drive is
[`bin/commands/internal/app-artifacts.ts`](bin/commands/internal/app-artifacts.ts)
— read its docblock before touching either command. It owns the three stages
(`prepareCompositionSources` → `generateAppSources` → `buildAndPublishWebDist`),
`resolveFrontendMode`, `fastValidationJobs` and `acquireArtifactLock`, plus the
explicit list of what stays *out* (cluster readiness, the run ledger, gateway
HTTP, worktree-op markers, compose-serve, `propagateConfigToUser`). It is split
into three functions rather than one because `build`'s dev-only steps interleave
*between* them. Same shape, one level up, as codegen's `regen-pipeline.ts`.

Two consequences worth knowing before editing:

- **`build` passes `composition: null`, and that is load-bearing.** It is what
  makes stage 1 run `clearCompositionRegistries`, so a filtered registry left in
  the checkout by an earlier release is swept and the runtimes revert to the full
  committed set. `--serve-composition` is a different, unrelated flag: it
  composes *other* namespaces out of main's artifact fleet after main deploys.
- **`build-composition`'s transitive import set must stay a SUBSET of
  `build.ts`'s.** Bun freezes a module on first `import()`;
  `regenerateManifestCodegen` must arm `setPreBarrelImportGuard` before any
  plugin barrel is imported, or `pruneOrphanedConfigFiles` deletes a
  freshly-authored config override — silent data loss. Keeping the set a subset
  inherits that property from the caller that already has it. It is also why
  `release.ts` (which statically imports plugin barrels) **shells out** to
  `build-composition` instead of calling the module in-process: process
  isolation is the correctness boundary, not an implementation detail.

Design + rationale:
[`research/2026-07-28-cli-hermetic-artifact-phase.md`](../../../../research/2026-07-28-cli-hermetic-artifact-phase.md).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Exports (types): `MergeMarkerKind`
  - Exports (values):
    - `clearMergeMarkers`
    - `findClaudeMdConflicts`
    - `MERGE_MARKER_KINDS`
    - `mergeMarkerDir`
    - `readMergeMarkers`
    - `resolveGitDir`

<!-- AUTOGENERATED:END -->
