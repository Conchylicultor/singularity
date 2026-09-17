# type-check

The unified TypeScript + type-aware-ESLint check. It replaces the separate
`typescript` and `eslint` checks, which each built the full TS program (tsc for
diagnostics; typescript-eslint via `projectService` for the type-aware rules).
Type-aware linting is ~99% TS-program construction — the same work tsc does — so
the cold cost was paid twice. This check builds each tsconfig target's program
**once** (in a per-target worker process) and reads both tsc diagnostics and
type-aware lint off it, via typescript-eslint's `parserOptions.programs`.

## Shape

- `check/index.ts` — the **check runner's thread**, shared by every check in
  the pass. Only: the async git reads (`getWorktreeRoot`, `readTreeListing`),
  the outer read-set (recorded from the listing alone), the grant fan-out, the
  log lines, the verdict.
- `check/prepare.ts` — the **preparation thread** (one Bun `Worker` per run;
  entry `prepare-worker.ts`, runner-side host `prepare-thread.ts`). Discovers
  targets, builds the import graph + closure fingerprints, parses each
  tsconfig's include-expansion, assigns every lintable file to exactly one
  program (include-roots + forward-import closure; `web-core` first so shared
  `core`/`shared` files match what projectService picks), runs the coverage
  gate (replaces projectService's "every file resolves to a project"), buckets
  the closure cache, materializes warm bases, computes program keys → returns a
  `Plan` and keeps the session. After the fan-out, `finalize` runs the records:
  warm-base publish, lint PASSes, program PASSes, skipped re-records.
- `shared/worker.ts` — per-target worker **process**. `createIncrementalProgram` →
  `getPreEmitDiagnostics` (+ persists the shared `.tsbuildinfo`) → ESLint
  `Linter.verify` with the program injected. One process per target so each
  single-threaded program build runs on its own core.

**Nothing that reads file bytes or walks the tree goes in `index.ts`** — it goes
in `prepare.ts`, whose values only the worker imports. That work is 70–130 s of
synchronous CPU; on the runner's thread it froze every concurrent check (no
timer, no socket), so `migration-applies-clean`'s pg connect sat silent past
Postgres's 60 s `authentication_timeout` and failed with `ECONNREFUSED`
(`research/2026-09-10-tooling-type-check-prepare-off-thread.md`).

A thread, not a helper process, because the session must survive the fan-out:
the record phase reuses the prepare phase's fingerprints, keys and
`ProgramKeyContext.contentHash` memo, which a process would have to serialize.

New files go FLAT in `check/` or `shared/`: `selfSourceHash()` hashes only the
top-level `.ts` there, and it is part of every program key — a subdirectory
would silently fall out of it.

## The file universe comes from git, and is enumerated once

`run()` takes ONE `readTreeListing(root)` — a `TreeListing` whose files come
from `listRepoFiles` (`checks/core`) — and hands that value to every consumer:
`buildImportGraphs` (preparation thread) and `recordOuterReadSet` (runner
thread) both filter it with `lintableFiles`, so the recorded set is the linted
set; `findGlobalTriggerFiles` with `isGlobalTrigger`; the program key with
`isTscTrigger` and `isTsName`. The listing crosses to the thread as a value, so
it never re-lists. Nothing below the listing enumerates: `import-graph.ts`,
`fingerprint.ts` and `program-key.ts` only read the bytes of files handed to
them, which is why they stay synchronous.

This matters because the check is `inputKeyed`: its verdict must be a function
of the tree its cache key hashes, and that key is git-derived
(`computeTreeHash` = scratch index + `git add -A`). Both of the walks this
replaced saw _more_ than the key — every gitignored file — so on 2026-09-09 a
stray `.ts` an agent had left under `.cache/scratch/` counted as lintable,
matched no tsconfig program, and failed a push over content no commit contains.
The second walk had a matching bug of its own: it skipped a literal `dist`
segment but not `dist.staging.*` / `dist.live.*` / `dist.old.*`, so a build
artifact under one moved the global fingerprint and invalidated the whole
closure cache.

The two predicates now spell only what `.gitignore` does not: `*.generated.ts`
and `prototypes/**`, the remainder of eslint's ignore list
(`lint/core/build-lint-config.ts`) once git has done its part. Do not restate
`node_modules` / `dist` / `.check-*` / `.claude/worktrees` there — a
git-enumerated set never contains them, and a second copy of that list is
exactly what drifted. See
`research/2026-09-09-tooling-check-file-enumeration-from-git.md`.

## Host-wide worker budget — the grant

Each worker builds a full multi-GB TS program. The fleet is bounded **host-wide**,
not per build: before this gate, N overlapping agent builds each spawned
`targets.length` workers, so 4–5 concurrent builds put 30–40 multi-GB processes on
a 64 GB box and the machine thrashed (see
`research/2026-07-09-global-type-check-worker-host-budget.md`).

This check **acquires nothing host-wide.** It spends the CPU grant its invoking
build/check/push already holds — `ctx.grant` (see
`@plugins/infra/plugins/host-admission`). It fans out one worker per target at
`ctx.grant.units` concurrency, spending a unit per worker via `ctx.grant.run`, so
the whole host runs at most `B` type-check-class workers total (the single laned
`cpu` pool's size), subdivided across every concurrent build's fan-out — not
`targets.length` per build.

- **The grant carries the lane and the budget.** `interactive` = main build +
  push (a human is blocked); `background` = agent build + direct agent check. The
  CLI classifies the origin and passes the lane to `withHostGrant`; the resulting
  `units` are drawn from the interactive lane's reserved floor or the background
  window accordingly. A push runs its checks on the rebased _agent_ branch yet
  stays interactive because it INHERITS the grant (its env), not because of any
  branch gate.
- **`B` is the residual of the summed host budget**, declared once in
  `host-admission/core` (not recomputed here). On this host `B = 11`,
  `backgroundLimit = 8`.
- **`targets.length` is NOT a term in `B`.** It only bounds this build's request
  (`max`, capped inside the CLI at `cpuBudget().B`); a reduced grant just runs the
  fleet at lower concurrency.
- **Demotion is a separate axis, unchanged.** `workerDemotion()` still keys on
  `branch === "main"`, so push's workers stay darwinbg-demoted exactly as before.
  Admission (the grant) and scheduling priority (demotion) are orthogonal.
- **Contention is legible.** When the grant holds fewer units than there are
  targets, the check writes one plain stderr line
  (`type-check: 3 of 8 targets run concurrently (host CPU grant)`). Checks run
  under `Promise.all`, so it must never be a blocking log or a progress bar.

## A target whose program is unchanged is skipped

An outer-cache MISS used to rebuild all seven programs even when the edit could
not possibly reach five of them: measured, the same file is checked **3.7 times
per miss** (28,494 file-checks for 7,673 distinct files), because the five
node-side programs are near-copies of one another and `test` contains everything
but 301 files. So `check/program-key.ts` gives each target a content key for ITS
program, and a target whose key is already recorded green runs no worker.

The key is not the import graph. The import graph has blind spots (`*.generated.ts`
are excluded from it yet are tsc roots; `/// <reference>`, computed `import()`,
resolution shadowing), which are harmless only while tsc re-runs as the backstop
— and a skip removes that backstop. So the key is built from what TypeScript
itself loaded: `fileNames` out of the target's `.tsbuildinfo` (`L_t`), each file
hashed by content, repo and `node_modules` alike; plus the tsconfig's own
include-expansion (`R_t`), every `tsconfig*.json` / `package.json` / lockfile /
ambient `.d.ts`, a name-only census of every `.ts` in the repo (the
added-file-shadows-a-resolution hazard), and this check's own source.

Three orderings are load-bearing:

- The key is computed **after `materializeWarmBase`**, so a fresh worktree can
  enumerate a program from a sibling's base and skip on its very first run.
- The skip clause is read **after `lintByTarget` is built**: a target with files
  still to lint is never skipped, so an evicted per-file lint PASS re-runs its
  worker. That clause is also what lets the tsc key drop the lint-only globals
  (`eslint.config.ts`, `plugins/**/lint/**`): a lint-rule edit flips every
  closure fingerprint, so every bucket is non-empty and nothing skips.
- A PASS is recorded from the buildinfo the worker just **wrote**, so what is
  recorded describes the program that actually passed.

No buildinfo, an unparseable tsconfig, or a buildinfo shape we do not recognise
means **no key**, which means a cold run — never a key over an empty program.
Those three are distinct arms of a discriminated result, not one nullish value,
and the run NAMES the targets it could not key (`no program key for 2
target(s) — test: no buildinfo yet; …`): "5 of 7 skipped" with no account of
the other two is the shape of a report that hides a broken key.

The store is `programPassDir` (host-global, content-addressed, 14-day age
bound), a sibling of the closure cache over the shared `check/pass-set.ts`.

Every run logs `type-check: skipped N of M targets…`, including `skipped 0` —
the zero is what separates a cold tree from a broken key.

`--no-cache` (and `SINGULARITY_CHECK_NO_CACHE=1`) disarms the skip, via
`ctx.cacheEnabled`: someone typing it wants every tsc program actually rebuilt.
It does NOT disarm the RECORD — the passes that run produces are still good
facts. The per-file lint closure cache is unaffected either way.

## Which base a fresh worktree starts from

Every run picks an incremental `.tsbuildinfo` to start each target from, out of
a host-global pool every worktree publishes into
(`checks/core/warm-base.ts`). That choice is worth about 2 GB and 30 s against
7 GB and 240 s per target, and nothing downstream catches a bad one — a
mismatched base is not wrong, only slow.

The pool used to hand out its NEWEST entry, which is always some sibling
branch: measured, seeding from it cost the same as starting cold, and 75 % of
`web-core` runs host-wide were near-cold. So a base is now chosen by **content
overlap**. Each candidate records a `version` per file (tsc's sha256 of the
file's text); the run hashes the files on disk and counts how many still match.
The highest count wins, ties go to the newer entry, and a local base already
present is replaced only by a strictly better one — so a worktree iterating in
place always keeps its own, while a just-rebased one picks up the pool's newer
main base.

Counts, not ratios: the score is "files tsc will not re-check", so a small
program matching perfectly must not beat a large one matching 99 % of ten times
as many files.

Two things make that work, and both are easy to get wrong:

- **A candidate is scored as if it already sat at this worktree's
  `.cache/tsbuildinfo/`.** A buildinfo's paths are relative to its own
  directory, so resolving a pooled entry against the pool directory gives paths
  that exist nowhere — every candidate scores zero and the pool silently looks
  empty. `readProgramFileList` takes the destination base explicitly for this.
- **The entry worth picking has to still be there.** A published base is
  labelled with its worktree's `HEAD` sha (`<ms>-<pid>-<sha12>.tsbuildinfo`),
  and the prune keeps the newest three plus up to six further entries whose sha
  is an ancestor of `main`. A fresh worktree's tree IS a main commit's tree, and
  the agent whose branch tip became that commit published exactly that base —
  which pure recency evicted within minutes. `main` is only fast-forwarded, so
  "is on main" never flips back.

`HEAD` is read once per run, in `finalize`, not once per target. When it is
unavailable the run publishes legacy unlabelled entries — still usable as
bases, never protectable — and says so on its summary line rather than
swallowing it.

The file hashes this needs are the ones the program keys need anyway: `prepare.ts`
creates one `ContentHashMemo` before the selection and hands the same memo to
`openProgramKeyContext`, so each file is read once and both steps necessarily
saw the same tree.

The pool has exactly ONE producer of a buildinfo: `shared/worker.ts`, spawned
through `core/spawnTypeCheckWorker`. The build's `--skip-checks` fast path
(`cli/plugins/build/cli/internal/app-artifacts.ts`) used to run its own
`tsc --noEmit` and publish the result into the same pool — a base whose every
signature is a placeholder, which makes a body-only hub edit re-check its whole
importer closure for whoever picks it up. It now spawns the same worker with no
lint files, so the compiler options and the declaration emit live in one place
and the two producers cannot drift.

## One reading of the tree, passed around

`readTreeListing(root)` takes one git-backed reading of the repo per run, and everything that asks
what files exist takes that value: the lint universe, the outer read-set's trigger facts, the closure
fingerprints' global component, and both halves of the program key. It used to be four independent
filesystem walks — seconds of traversal, measured, and four copies of the rules for what to skip
(`node_modules`, `dist`, `.check-*`, `.claude/worktrees`), which is also how they came to disagree
with the cache key. Now there are no rules to copy: `.gitignore` is the rule.

It is a value rather than a cache behind the function on purpose. A listing is a snapshot of a tree
that keeps changing, so its staleness window belongs at the call site; as a module-level memo the
window was silently "the rest of the process".

**One exception, in `program-key.ts`.** The per-composition registries
(`web.composition.<name>.generated.ts`) are gitignored yet sit inside a tsconfig `include`, so tsc
compiles them — and two exist on `main`. A git-derived listing drops them, which silently removed them
from the name census that guards against resolution shadowing; since that key decides whether tsc runs
for a target at all, nothing behind it would catch the miss. The census unions them back in via
`listNamedCompositionRegistries` — the codegen function that WRITES them, so reader and writer cannot
drift about where they live.

`no-adhoc-repo-walk` (lint) bans the hand-written directory deny-list shape, so the next copy cannot
appear.

A BUILD will skip less than a bare check of the same tree, by construction: `./singularity build`
regenerates barrel stubs and plugin registries before it runs checks, and those generated files sit
in six of the seven programs. Measured on the build that shipped this change: `skipped 1 of 7`
during the build, `skipped 7 of 7` on the very next standalone check.

## Reading the transcript

`~/.singularity/worktrees/<wt>/check-<runId>.log` carries a handful of greppable
lines per run, and they are the instrument every claim about this check is made on:

- `type-check: skipped N of M targets, program unchanged since last pass: …
(program keys <ms>ms)` — the per-target hit rate, and what the keys cost.
- `type-check: no program key for N target(s) — <target>: <why>; …` — only when
  some target could not be keyed at all.
- `type-check: <units> of <n> targets run concurrently (host CPU grant)` — only
  when the grant is narrower than the fleet.
- `type-check worker <target>: cpu 86.6s, maxRSS 2.4 GB` — one per worker that
  RAN (a skipped target has no line, by construction).
- `type-check: warm base <target>: …` — one per target, every run, saying
  which incremental base it started from and how much of it still matches:
  `seeded 6701/6858 from pool <entry>` (cold worktree, took a pooled base),
  `pool <entry> matched 6701/6858 files (local 5120, replaced)` (a pooled base
  beat the local one), `kept local 6799/6858 (best pool 6701)` (the local base
  won), or `cold, pool empty`. A `seeded`/`kept` count far below the
  denominator is the signal that the pool holds nothing that fits.
- `type-check: published 7 warm bases labelled <sha12> (web-core: kept 5, 2 on
  main)` — once per run, after the fan-out. `UNLABELLED (git: <reason>)`
  instead when `HEAD` could not be read; the parenthetical lists only targets
  whose pool kept an entry for being on main.
- `type-check: prepared off-thread in 71.3s (finalize 2.1s)` — once per run:
  the preparation thread's cost before and after the fan-out (the work that
  used to freeze the runner; most of it is `parseTargetRoots`' include
  expansion). A coverage-gate failure says `(finalize skipped: coverage gate
  failed)`.

**Use `cpu`, not wall clock.** The identical `web-core` program build measured
105s at host load 12.8 and 266s at load 14.0; wall clock on this box measures
the neighbours. The same rule bites one level up: a per-check duration from a
parallel check pass measures the queue, so any per-check cost claim needs
`./singularity check --jobs 1`.

## Invariants / caveats

- **tsc still checks shared `core` files under every program that includes
  them** (web + server + central) — same as the old typescript check. Lint runs
  **once** per file (single owner) to avoid duplicate violations.
- The flat config comes from the shared builder
  `@plugins/framework/plugins/tooling/plugins/lint/core` (`buildLintConfig`),
  the same one the root `eslint.config.ts` uses — editor and check can't drift.
- Warm paths: tsc is incremental via `.cache/tsbuildinfo/<target>.tsbuildinfo`,
  and the worker EMITS declarations to a writer that keeps only the buildinfo,
  so every file in it carries a real signature (the hash of its public shape).
  That is what lets tsc skip the importers of a file whose body changed but
  whose API did not — under `noEmit` the signature is a placeholder and a
  body edit in a hub re-checks its whole importer closure (measured 4.4× the
  CPU and 3× the RAM of the same edit with real signatures). The price is that
  every exported value must have a nameable type: a `TS2883` / `TS4023`
  declaration diagnostic is a real error here, fixed by an annotation;
  lint reuses the global closure cache (only closure-changed files re-lint); and
  a target whose whole PROGRAM is unchanged runs no worker at all (below). A
  worker that crashes records no PASSes (re-lints next run).
- A new lintable file in **no** tsconfig `include` and reachable from **no**
  program fails the coverage gate. Since the universe is git-derived, such a
  file is genuinely repo source: add its dir to a tsconfig `include`. If it is
  not source, it does not belong in the git tree — delete it or gitignore it.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Uses: `infra/spawn.spawnCaptured`
  - Exports (types):
    - `TypeCheckWorkerJob`
    - `TypeCheckWorkerResult`
    - `TypeCheckWorkerRun`
  - Exports (values):
    - `spawnTypeCheckWorker`
    - `tsconfigPathOf`

<!-- AUTOGENERATED:END -->
