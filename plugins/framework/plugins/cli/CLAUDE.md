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
<<<<<<< .merge_file_RVXROF
| `build` | **Deploy this checkout into the live dev cluster**, *or* — `--hermetic --composition <name…>` — **produce one or more compositions' artifact sets on a bare host from a fresh `git clone`.** The deploy posture is the inner loop: artifacts + Postgres readiness, the worktree DB fork, the `build_runs` ledger, gateway spec/restart/health probe, compose-serve; it needs a provisioned dev box. The hermetic posture is filtered registries + generated migration SQL + the web dist, as a function of (source tree, compositions) only — no cluster, no gateway, no ledger. |
| `release` | Wraps `build --hermetic` and packs its output into a portable self-contained app (`--target web` / `tauri`). |
| `check` | Run the repo validation checks (also the first step of `push`, and mid-`build`). |
=======
| `build` | **Deploy this checkout into the live dev cluster.** The inner loop: artifacts + Postgres readiness, the worktree DB fork, the `build_runs` ledger, gateway spec/restart/health probe, compose-serve. Needs a provisioned dev box. |
| `build-composition` | **Produce one composition's artifact set, hermetically.** Filtered registries + generated migration SQL + the web dist, as a function of (source tree, composition) only. No cluster, no gateway, no ledger — runs on a bare host from a fresh `git clone`. |
| `release` | Wraps `build-composition` and packs its output into a portable self-contained app (`--target web` / `tauri`). |
| `check` | Run the repo validation checks. **The only in-process caller of `runChecks()`** — `build` and `push` both SPAWN this command via [`bin/check-subprocess.ts`](bin/check-subprocess.ts) (read its docblock), so their two `checks ✓` are one claim and the global cache stays honest. |
>>>>>>> .merge_file_x97AkK
| `test` | Run tests under the given paths (default: whole `plugins` tree) through **both** runners sequentially (`bun test`, then `vitest run`), then summarize both buckets — an empty one is stated, not implied, because either runner alone is green-but-partial. Paths only; no flag forwarding. |
| `push` | Checks → merge the worktree branch back into main → push. |
| `format` | Prettier over the `.ts`/`.tsx` changed on this branch — the same pass `build` runs, in seconds. It exists because `push` never builds, so a `format-clean` failure would otherwise cost a full build. |
| `regen-generated` / `regen-migrations` | The repo-tree codegen and migration-generation pipelines as standalone commands (used by the normalize pass). |
| `normalize-generated` | Marker-gated repair of generated artifacts a merge driver auto-resolved. Invoked by the `post-rewrite` hook; rarely run by hand. |
| `apply-migrations` / `serve-app` | Runtime entrypoints a released bundle's launcher invokes. |
| `db` / `start` | DB fork/list/drop admin, and the one-time gateway bring-up. |

`build`, `check` and `push` are the **op commands** (`orphan-guard.ts`'s
`OP_COMMANDS`): long-running and host-lock-holding, so they install the orphan
guard, which exits the op once its invoking shell dies — an orphaned op must
never sit on a host lock (the push mutex, worst case). That is now the *only*
effect of membership. Nothing else is an op command.

Membership is keyed on `process.argv[2]` before any flag is parsed, so a
**hermetic** build (`build --hermetic`) is inside an op command too and installs
the orphan guard. That is the right behaviour and the only op machinery it gets:
an orphaned hermetic build exits instead of sitting on `.build.lock`. Under
`release` the guard is inert — the child's ppid is release's — so it fires only
if release itself dies, which is exactly when dropping the lock is correct.
Nothing else the deploy posture arms (progress file, op profiler, run recorder,
worktree-op markers, exit hooks, verdict guard, deploy receipt) exists on that
path; see `bin/commands/internal/hermetic-build.ts`.

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
`app-artifacts.ts` stage 1, and `push`'s post-rebase install (`frozenLockfile:
true`, so a mid-push tree is never re-resolved). No bare `bun install` remains:
one skipping the lock races `clonefileat`, one skipping the stamp makes the next
process reinstall from scratch.

**A process that installs must not then resolve an npm package — it re-execs**
(`bin/reexec.ts`, on `installed: true`). Bun's resolver caches directory listings
from process start, so the process that runs `bun install` cannot see the
`node_modules` it just created — every workspace-local one (`commander` under
`plugins/framework/plugins/cli/`) was already cached absent. The dynamic
`await import("./cli")`
fixes *when* resolution happens, the re-exec fixes *which process* does it; both
are required, and `cli:bootstrap-package-free` measures only the first.

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

## Locks: the kernel owns them (`bin/build-lock.ts`)

Both locks are an exclusive `flock(2)` on a regular file, via
`packages/flock`. The kernel drops the lock when the fd closes **or the holder
dies** — SIGKILL and OOM included — and no pid is consulted, so PID reuse cannot
confuse it.

Two rules that look wrong and are not:

- **The lock file is never unlinked.** Release is `closeSync`. The fd *is* the
  lock, so there is nothing to delete, and an unlink could only ever remove a
  successor's lock.
- **The pid written into the file is diagnostics only.** Nothing reads it back to
  decide ownership. Do not reintroduce a `kill(pid, 0)` probe or a heartbeat: a
  heartbeat proves the event loop turns, not that the build is progressing, so a
  build wedged on a hung child looked healthy under the old scheme. "What is the
  holder stuck in?" is answered instead from `~/.singularity/logs/build-progress/build-progress.jsonl`,
  which records the actual span.

## The deploy receipt (`bin/build-receipt.ts`)

`~/.singularity/worktrees/<wt>/build-status.json` — `running` once the build lock
is granted, rewritten `ok` / `failed` / `superseded` in `finalizeBuild`. **One
fixed path, deliberately with no `<buildId>` variant**: every other build artifact
is per-run, so "did my build land?" could only be asked of them through
`ls -t build-*.log | head -1`, which answers with a *previous* run's `BUILD OK`
whenever the current one was killed before writing its own.

A SIGKILLed build runs no handler, so it leaves the receipt at `running` with a
dead pid — which `resolveReceipt` reports as `interrupted`, and which `build`,
`check` and `push` each announce at startup via `reportInterruptedPredecessor`.
That is the only trace such a build leaves: it printed no verdict (the
`installVerdictGuard` backstop cannot run) and its exit status is invisible behind
a pipe.

The receipt is opened **after** the lock, not before — the lock serializes builds
in a checkout, so exactly one build owns the receipt at a time and a build that
dies while still queuing cannot overwrite its predecessor's.

**A killed build and a build that failed its checks both write
`status: "failed"`** — what separates them is `exitCode` (`128+signo` vs `1`)
plus `signal`, stamped the moment a catchable signal arrives rather than only at
the terminal rewrite, so an *escalating* kill (SIGTERM then SIGKILL: `timeout -k`,
most supervisors) still records the SIGTERM on the `running` receipt the SIGKILL
strands. Do not "simplify" that early stamp away.

The signal→exit-code map is [`bin/fatal-signals.ts`](bin/fatal-signals.ts)
(`installFatalSignalExit`), shared by all three op commands. Its `afterInstall`
seam is load-bearing: **Bun installs its `sigaction` lazily on the first
`process.on(sig)` and does not chain**, so a native handler for these signals
must be armed strictly after that loop or it is silently overwritten.

## The artifact / deploy seam

`--composition` once meant "deploy this checkout, but filtered" — so cutting a
release required a machine that was already a Singularity dev box, and the
artifact was a function of the developer's environment rather than of the source.
The flag is back, and the split it was missing is now a **posture** of the one
verb rather than a second command: `build --hermetic --composition <name…>` is
the artifact half (bare host, fresh clone, no cluster contact, N compositions per
invocation), plain `build` is the deploy half. `--composition` without
`--hermetic` is refused — building a composition *into the dev cluster* is a
later phase and needs a namespace rule the hermetic path does not.

The ordered pipeline both postures drive is
[`bin/commands/internal/app-artifacts.ts`](bin/commands/internal/app-artifacts.ts)
— read its docblock before touching either posture. It owns the three stages
(`prepareCompositionSources` → `generateAppSources` → `buildAndPublishWebDist`),
`fastValidationJobs` and `acquireArtifactLock`, plus the
explicit list of what stays *out* (cluster readiness, the run ledger, gateway
HTTP, worktree-op markers, compose-serve, `propagateConfigToUser`). It is split
into three functions rather than one because `build`'s dev-only steps interleave
*between* them. Same shape, one level up, as codegen's `regen-pipeline.ts`.

Two consequences worth knowing before editing:

- **Every filtered registry is per-name** (`<dir>.composition.<name>.generated.ts`)
  and `plugins-active.ts` selects one only under a matching
  `SINGULARITY_WORKTREE`, so another namespace's file cannot reconfigure this
  worktree's backend — a plain `build` passes `compositions: []` simply to emit
  none. `--serve-composition` is unrelated: it composes *other* namespaces out of
  main's artifact fleet after main deploys.
- **Nothing in the CLI *process*'s import closure may reach a registered
  pre-barrel or post-web codegen manifest.** Bun freezes a module on first
  `import()`, and stage 2 regenerates every such manifest and then re-reads it: a
  manifest frozen at CLI load is rewritten on disk but never re-read, so
  `generateConfigOrigins` sees the previous run's descriptor set and
  `pruneOrphanedConfigFiles` deletes a freshly-authored config override — silent
  data loss, no failing step. Enforced by `cli:codegen-manifests-not-frozen`,
  which walks `bin/index.ts`'s closure against `preBarrelManifests` /
  `postWebManifests`. The old subset-of-`build.ts` framing never measured this:
  `bin/cli.ts` already statically reaches 14 plugin server barrels through
  `release.ts`, and a frozen *barrel* is harmless — its frozen generated *inputs*
  are not. It is still why `release.ts` **shells out** to a fresh `build
  --hermetic` process instead of calling the module in-process: process isolation
  is the correctness boundary, not an implementation detail.

Design + rationale:
[`research/2026-07-28-cli-hermetic-artifact-phase.md`](../../../../research/2026-07-28-cli-hermetic-artifact-phase.md),
then [`research/2026-08-18-cli-one-build-verb-artifact-half.md`](../../../../research/2026-08-18-cli-one-build-verb-artifact-half.md)
for the fold back into one verb.

### A build names WHICH dist it produces; it never spells a path

`buildAndPublishWebDist` takes a `WebDistTarget` — `{kind:"served",name}` or
`{kind:"release",worktree,composition}` — and `webDistPath()` is the one mapping
from identity to directory (callers resolve their own `sweepDistLeftovers`
through it too). Two consequences that look wrong and are not:

- **`webDir` is for `.build.lock` only.** The lock is per-checkout because it
  guards registry codegen written *into* the checkout — unrelated to where the
  dist lands. Don't re-derive `livePath` from it.
- **The building worktree's name is `checkoutWorktreeName(root)`, never
  `currentWorktreeName()`** — the CLI never sets `SINGULARITY_WORKTREE` for
  itself, so the env-derived name answers `singularity` from every worktree.
  `release` spawns `build --hermetic` with `cwd` at that root, so both resolve
  the same dist by construction.

**No dist lives in a checkout.** Both arms resolve under
`~/.singularity/worktrees/` — served at `<name>/web`, release scratch at
`<wt>/release-web/<id>` — so a checkout carries no build output. The backend-side
twin is `webDistDir()` (`infra/paths`), which is per-NAMESPACE and must stay a
function, not a const. The pre-S4 in-checkout tree is reclaimed by
`internal/legacy-dist-reap.ts`, gated on the **running gateway** reporting the
new path (`GET /gateway/worktrees`), never on `spec.json` — the gateway serves
from its own in-memory spec, so disk is no evidence about what is being served,
and that gate was observed deleting a live tree. Every other answer (unreachable,
unregistered, malformed) fails closed, which also keeps a `--hermetic` build
hermetic: a bare release host has no gateway and no served legacy dist either.
[`research/2026-08-06-global-one-dist-per-namespace.md`](../../../../research/2026-08-06-global-one-dist-per-namespace.md).

### The experimental frame is stamped by the producer

The red agent-worktree border is stamped into the staged `index.html` by
`buildAndPublishWebDist`'s `experimental` flag
([`bin/commands/internal/experimental-marker.ts`](bin/commands/internal/experimental-marker.ts)),
never inferred in the browser: `<name>.localhost` is equally the grammar for
worktree deploys, composition namespaces and release previews, so no client-side
rule can tell them apart. Only `build` from a non-main worktree passes `true` —
every other dist producer is clean by default, not by exclusion. CSS rule in
ui-kit's `theme/app.css` (JS-sets / CSS-styles split, as with `.dark`).

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
