# type-check

The unified TypeScript + type-aware-ESLint check. It replaces the separate
`typescript` and `eslint` checks, which each built the full TS program (tsc for
diagnostics; typescript-eslint via `projectService` for the type-aware rules).
Type-aware linting is ~99% TS-program construction — the same work tsc does — so
the cold cost was paid twice. This check builds the repo's TS program **once**
(in one worker process) and reads both tsc diagnostics and type-aware lint off
it, via typescript-eslint's `parserOptions.programs`.

## One program, and why there is no target list

There is exactly ONE TypeScript program: the root `tsconfig.json`, whose
`include` is `["plugins", "test", "*.config.ts"]` — every `.ts`/`.tsx` git
tracks. `checks/core/discover.ts` names it (`repoProgram(root)`) and there is
nothing to iterate.

Until 2026-09-18 there were seven tsc targets — `web-core` (its own
`tsconfig.app.json`), `server-core`, `central-core`, `cli`, `tooling`, `tools`
(root `tsconfig.tools.json`) and `test` (root `tsconfig.test.json`) — and the
check spawned a worker per target. **Do not reintroduce that split**, and read
the measurement before proposing any second program.

### The measurement, so the isolation belief cannot come back

The split was believed to buy type-environment isolation: the doc that stood
here claimed "a `window` reference in `core/` fails under the node program".
**It did not.** Read from the seven pooled `.tsbuildinfo` files (TypeScript
6.0.3, this host, 2026-09-17), **six of the seven programs loaded the same
environment**:

- `lib.dom.d.ts` — the node-side tsconfigs set no `lib`, and the default for
  target ES2023 is `es2023.full`, which includes DOM.
- `@types/node`, `@types/bun`, `@types/react` — `tsconfig.app.json` set no
  `types`, so every `node_modules/@types/*` at the root was auto-included, and
  that auto-included set was exactly the set `tsconfig.test.json` named
  explicitly.

Only `tools` (`lib: ["ES2023"]`) withheld DOM, and every file it covered was
already checked under DOM by six other programs. Runtime isolation — web must
not import server — is the `plugin-boundaries` check's job, not tsc's.

What the split cost, from the same buildinfos: **30,649 file instances for 8,252
distinct repo files (3.7×)**.

| files in N programs | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| count | 1,148 | 3,137 | 76 | 365 | 49 | 3,045 | 432 |

`test` alone held 8,053 of the 8,252, of which only 1,076 were test-only — so
`test` was already a working prototype of the single program, and the union is
that program plus ~2.5% more files. Per-worker cost on a cold miss, over every
check transcript on this host (n ≈ 300 per target):

| target | cpu mean | peak RSS mean | max |
| --- | --- | --- | --- |
| test | 180 s | 7.2 GB | 16.6 |
| web-core | 209 s | 6.7 GB | 14.3 |
| server-core | 104 s | 4.3 GB | 7.8 |
| cli | 78 s | 3.9 GB | 8.8 |
| central-core | 79 s | 3.8 GB | 7.7 |
| tooling | 67 s | 3.5 GB | 6.8 |
| tools | 22 s | 1.0 GB | 1.9 |

A cold miss ran all seven at once: ~740 CPU-s and ~30 GB of simultaneous
resident memory. One worker is ~180 CPU-s and ~7 GB.

Design and decision: `research/2026-09-18-global-type-check-one-program.md`.

## Shape

- `check/index.ts` — the **check runner's thread**, shared by every check in
  the pass. Only: the async git reads (`getWorktreeRoot`, `readTreeListing`),
  the outer read-set (recorded from the listing alone), the one grant spend, the
  log lines, the verdict.
- `check/prepare.ts` — the **preparation thread** (one Bun `Worker` per run;
  entry `prepare-worker.ts`, runner-side host `prepare-thread.ts`). Builds the
  import graph + closure fingerprints, parses the tsconfig's include-expansion,
  runs the coverage gate (replaces projectService's "every file resolves to a
  project"), buckets the closure cache, materializes the warm base, computes the
  program key → returns a `Plan` and keeps the session. After the worker,
  `finalize` runs the records: warm-base publish, lint PASSes, the program PASS
  or its re-record.
- `shared/worker.ts` — the worker **process**. `createIncrementalProgram` →
  `getPreEmitDiagnostics` (+ persists the shared `.tsbuildinfo`) → ESLint
  `Linter.verify` with the program injected. A separate process so the
  single-threaded program build runs on its own core and its peak RSS is
  measurable from outside.

**Nothing that reads file bytes or walks the tree goes in `index.ts`** — it goes
in `prepare.ts`, whose values only the worker imports. That work is 70–130 s of
synchronous CPU; on the runner's thread it froze every concurrent check (no
timer, no socket), so `migration-applies-clean`'s pg connect sat silent past
Postgres's 60 s `authentication_timeout` and failed with `ECONNREFUSED`
(`research/2026-09-10-tooling-type-check-prepare-off-thread.md`).

A thread, not a helper process, because the session must survive the worker:
the record phase reuses the prepare phase's fingerprints, key and
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

(The root tsconfig's own `exclude` is the one place that list legitimately
reappears: tsc expands `include` by walking the FILESYSTEM, not by listing git,
so it needs `**/node_modules` and the `dist*` release trees named. Dot-prefixed
directories are never matched by a tsconfig wildcard, so `.cache` and
`.claude/worktrees` need no entry there either.)

## The coverage gate is set subtraction

`uncovered = lintable − roots`, where `roots` is the tsconfig's own
include-expansion. A lintable file that is not a root is, under a blanket
include, outside `include` by definition — a stray `scripts/x.ts` at the repo
root, or a new top-level directory — which is exactly what must fail.

It used to need a forward-import closure walk from each target's roots, because
a file could legitimately be outside every `include` yet reachable from one.
That case does not exist with one blanket include, so the walk is gone.

A tsconfig that will not PARSE is its own arm of the result, not an empty root
list. An empty list would report every lintable file as orphaned — a wall of
noise for one broken JSON file — and would mint a program key for a program we
could not describe. The `unparsed` arm skips the gate and the key and lets the
worker run, where tsc reports the broken config as the one diagnostic it is.

## Host-wide worker budget — the grant

The worker builds a multi-GB TS program. The fleet is bounded **host-wide**, not
per build: before this gate, N overlapping agent builds each spawned
`targets.length` workers, so 4–5 concurrent builds put 30–40 multi-GB processes
on a 64 GB box and the machine thrashed (see
`research/2026-07-09-global-type-check-worker-host-budget.md`).

This check **acquires nothing host-wide.** It spends the CPU grant its invoking
build/check/push already holds — `ctx.grant` (see
`@plugins/infra/plugins/host-admission`) — via `ctx.grant.run`, so the whole host
runs at most `B` type-check-class units total (the single laned `cpu` pool's
size), subdivided across every concurrent build.

- **The worker spends TWO units, not one** (`TYPE_CHECK_WORKER_UNITS`, declared
  in `core/worker-weight.ts`). A unit is `PER_UNIT_BYTES` = 3.6e9 bytes of
  resident memory, the fleet's mean; this process is measured at 7.2 GB mean
  peak, so it is worth `ceil(7.2 / 3.6) = 2`. The weight is DERIVED from the two
  constants, never a literal, so a retune of the quantum reflows into it. It is
  declared here, where the cost is measured, and nothing in `host-admission`
  names this consumer.
- **The grant clamps the request** to `min(units, grant.units)`. A 1-unit
  inherited grant (`SINGULARITY_HOST_GRANT=1`) runs the 2-unit request at weight
  1 — the grant IS the ceiling, the same rule as "a reduced grant just runs the
  fleet at lower concurrency" — so it can never wait for capacity it will not be
  given.
- **The grant carries the lane and the budget.** `interactive` = main build +
  push (a human is blocked); `background` = agent build + direct agent check. The
  CLI classifies the origin and passes the lane to `withHostGrant`; the resulting
  `units` are drawn from the interactive lane's reserved floor or the background
  window accordingly. A push runs its checks on the rebased _agent_ branch yet
  stays interactive because it INHERITS the grant (its env), not because of any
  branch gate.
- **`B` is the residual of the summed host budget**, declared once in
  `host-admission/core` (not recomputed here). On this host `B = 9`,
  `backgroundLimit = 6` — so at most four workers run host-wide (≈ 29 GB at the
  mean peak, under the 32 GB ceiling), and the background lane admits three
  concurrent agent type-checks.
- **Demotion is a separate axis, unchanged.** `workerDemotion()` still keys on
  `branch === "main"`, so push's workers stay darwinbg-demoted exactly as before.
  Admission (the grant) and scheduling priority (demotion) are orthogonal.

## The program is skipped when it is unchanged

An outer-cache MISS used to rebuild the program even when the edit could not
change what it contains. So `check/program-key.ts` gives the program a content
key, and a program whose key is already recorded green runs no worker.

The key is not the import graph. The import graph has blind spots (`*.generated.ts`
are excluded from it yet are tsc roots; `/// <reference>`, computed `import()`,
resolution shadowing), which are harmless only while tsc re-runs as the backstop
— and a skip removes that backstop. So the key is built from what TypeScript
itself loaded: `fileNames` out of the `.tsbuildinfo` (`L`), each file hashed by
content, repo and `node_modules` alike; plus the tsconfig's own
include-expansion (`R`), every `tsconfig*.json` / `package.json` / lockfile /
ambient `.d.ts`, a name-only census of every `.ts` in the repo (the
added-file-shadows-a-resolution hazard), and this check's own source.

Three orderings are load-bearing:

- The key is computed **after `materializeWarmBase`**, so a fresh worktree can
  enumerate the program from a sibling's base and skip on its very first run.
- The skip clause is read **after `lintFiles` is built**: a run with files still
  to lint is never skipped, so an evicted per-file lint PASS re-runs the worker.
  That clause is also what lets the tsc key drop the lint-only globals
  (`eslint.config.ts`, `plugins/**/lint/**`): a lint-rule edit flips every
  closure fingerprint, so the lint list is non-empty and nothing skips.
- A PASS is recorded from the buildinfo the worker just **wrote**, so what is
  recorded describes the program that actually passed.

No buildinfo, an unparseable tsconfig, or a buildinfo shape we do not recognise
means **no key**, which means a cold run — never a key over an empty program.
Those are distinct arms of a discriminated result, not one nullish value, and
the run says WHY it could not key (`type-check: no program key — no buildinfo
yet`): "running" with no account of why there was nothing to compare against is
the shape of a report that hides a broken key.

The store is `programPassDir` (host-global, content-addressed, 14-day age
bound), a sibling of the closure cache over the shared `check/pass-set.ts`.

`--no-cache` (and `SINGULARITY_CHECK_NO_CACHE=1`) disarms the skip, via
`ctx.cacheEnabled`: someone typing it wants the program actually rebuilt. It
does NOT disarm the RECORD — the pass that run produces is still a good fact.
The per-file lint closure cache is unaffected either way.

**What the single program costs, stated plainly.** Any edit anywhere now runs
the one worker, whose identical-tree floor is ~45 CPU-s / ~2.7 GB (the parse;
tsc's own incremental engine then re-checks only the affected closure, thanks to
the real signatures). Before, an edit confined to one target ran only that
worker — a `tools`-only edit cost 22 CPU-s / 1 GB. That is the price of not
paying 3.7× on every other kind of edit. The unchanged-tree case still skips
everything.

## Which base a fresh worktree starts from

Every run picks an incremental `.tsbuildinfo` to start from, out of a
host-global pool every worktree publishes into (`checks/core/warm-base.ts`).
That choice is worth about 2 GB and 30 s against 7 GB and 240 s, and nothing
downstream catches a bad one — a mismatched base is not wrong, only slow.

The pool is partitioned by (typescript version, program name), so the seven old
partitions are simply unused after this change and age out in 14 days; the
`repo` partition's first entry is published by the first run after merge, and
every fresh worktree seeds from it thereafter. Each EXISTING worktree pays one
cold run (~7–10 GB, 100–300 CPU-s) the first time it checks after rebasing.

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

`HEAD` is read in `finalize`, and only when there is something to publish. When
it is unavailable the run publishes a legacy unlabelled entry — still usable as
a base, never protectable — and says so on its summary line rather than
swallowing it.

The file hashes this needs are the ones the program key needs anyway: `prepare.ts`
creates one `ContentHashMemo` before the selection and hands the same memo to
`openProgramKeyContext`, so each file is read once and both steps necessarily
saw the same tree.

The pool has exactly ONE producer of a buildinfo: `shared/worker.ts`, spawned
through `core/spawnTypeCheckWorker`. The build's `--skip-checks` fast path
(`cli/plugins/build/cli/internal/app-artifacts.ts`) used to run its own
`tsc --noEmit` and publish the result into the same pool — a base whose every
signature is a placeholder, which makes a body-only hub edit re-check its whole
importer closure for whoever picks it up. It now spawns the same worker with no
lint files, at the same grant weight, so the compiler options and the
declaration emit live in one place and the two producers cannot drift.

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
(`web.composition.<name>.generated.ts`) are gitignored yet sit inside the tsconfig `include`, so tsc
compiles them — and two exist on `main`. A git-derived listing drops them, which silently removed them
from the name census that guards against resolution shadowing; since that key decides whether tsc runs
at all, nothing behind it would catch the miss. The census unions them back in via
`listNamedCompositionRegistries` — the codegen function that WRITES them, so reader and writer cannot
drift about where they live.

`no-adhoc-repo-walk` (lint) bans the hand-written directory deny-list shape, so the next copy cannot
appear.

A BUILD will skip less often than a bare check of the same tree, by construction:
`./singularity build` regenerates barrel stubs and plugin registries before it runs checks, and those
generated files are in the program.

## Reading the transcript

`~/.singularity/worktrees/<wt>/check-<runId>.log` carries a handful of greppable
lines per run, and they are the instrument every claim about this check is made on:

- `type-check: program unchanged since last pass, skipped (program keys <ms>ms)`
  or `type-check: program changed, running (program keys <ms>ms)` — whether the
  key hit, and what computing it cost. One or the other on EVERY run: the
  "running" half is what separates a cold tree from a broken key.
- `type-check: no program key — <why>` — only when the program could not be
  keyed at all.
- `type-check worker repo: cpu 186.6s, maxRSS 7.2 GB` — only when the worker RAN
  (a skipped run has no line, by construction). These are the numbers
  `TYPE_CHECK_WORKER_UNITS` is measured from, so a grep over many runs is how
  the weight gets re-derived.
- `type-check: warm base repo: …` — every run, saying which incremental base it
  started from and how much of it still matches: `seeded 6701/6858 from pool
  <entry>` (cold worktree, took a pooled base), `pool <entry> matched 6701/6858
  files (local 5120, replaced)` (a pooled base beat the local one), `kept local
  6799/6858 (best pool 6701)` (the local base won), or `cold, pool empty`. A
  `seeded`/`kept` count far below the denominator is the signal that the pool
  holds nothing that fits.
- `type-check: published 1 warm base labelled <sha12>` — after the worker.
  `UNLABELLED (git: <reason>)` instead when `HEAD` could not be read; a
  parenthetical `(kept N, M on main)` when the prune protected entries.
- `type-check: prepared off-thread in 71.3s (finalize 2.1s)` — once per run:
  the preparation thread's cost before and after the worker (the work that
  used to freeze the runner; most of it is `parseProgramRoots`' include
  expansion). A coverage-gate failure says `(finalize skipped: coverage gate
  failed)`.

**Use `cpu`, not wall clock.** The identical program build measured 105s at host
load 12.8 and 266s at load 14.0; wall clock on this box measures the neighbours.
The same rule bites one level up: a per-check duration from a parallel check pass
measures the queue, so any per-check cost claim needs `./singularity check --jobs 1`.

## Invariants / caveats

- **Every file is checked exactly once, and linted exactly once.** That is the
  whole point of the single program. There is no ownership assignment left in
  `prepare.ts` — it was `web-core`-first so shared `core`/`shared` files linted
  under the program projectService would pick, and with one program there is
  nothing to pick.
- The flat config comes from the shared builder
  `@plugins/framework/plugins/tooling/plugins/lint/core` (`buildLintConfig`),
  the same one the root `eslint.config.ts` uses — editor and check can't drift.
- Warm paths: tsc is incremental via `.cache/tsbuildinfo/repo.tsbuildinfo`,
  and the worker EMITS declarations to a writer that keeps only the buildinfo,
  so every file in it carries a real signature (the hash of its public shape).
  That is what lets tsc skip the importers of a file whose body changed but
  whose API did not — under `noEmit` the signature is a placeholder and a
  body edit in a hub re-checks its whole importer closure (measured 4.4× the
  CPU and 3× the RAM of the same edit with real signatures). The price is that
  every exported value must have a nameable type: a `TS2883` / `TS4023`
  declaration diagnostic is a real error here, fixed by an annotation;
  lint reuses the global closure cache (only closure-changed files re-lint); and
  an unchanged PROGRAM runs no worker at all (above). A worker that crashes
  records no PASSes (re-lints next run).
- **An editor loads this one ~11k-file project for any file**, where a
  server-only session used to load ~5.4k. Web sessions already loaded 9.8k.
- A new lintable file outside `plugins/`, `test/` and the root `*.config.ts`
  fails the coverage gate. Since the universe is git-derived, such a file is
  genuinely repo source: move it under `plugins/` where it belongs, or — if it
  really is a new top-level source tree — add it to the root tsconfig `include`.
  If it is not source, it does not belong in the git tree: delete it or gitignore
  it.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Uses:
    - `infra/host/host-admission.PER_UNIT_BYTES`
    - `infra/spawn.spawnCaptured`
  - Exports (types):
    - `TypeCheckWorkerJob`
    - `TypeCheckWorkerResult`
    - `TypeCheckWorkerRun`
  - Exports (values):
    - `spawnTypeCheckWorker`
    - `TYPE_CHECK_WORKER_PEAK_BYTES`
    - `TYPE_CHECK_WORKER_UNITS`

<!-- AUTOGENERATED:END -->
