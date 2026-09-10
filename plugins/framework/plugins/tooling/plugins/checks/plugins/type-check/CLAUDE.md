# type-check

The unified TypeScript + type-aware-ESLint check. It replaces the separate
`typescript` and `eslint` checks, which each built the full TS program (tsc for
diagnostics; typescript-eslint via `projectService` for the type-aware rules).
Type-aware linting is ~99% TS-program construction — the same work tsc does — so
the cold cost was paid twice. This check builds each tsconfig target's program
**once** (in a per-target worker process) and reads both tsc diagnostics and
type-aware lint off it, via typescript-eslint's `parserOptions.programs`.

## Shape

- `check/index.ts` — orchestrator. Discovers targets (`discoverTscTargets`),
  enumerates the repo ONCE via `listRepoFiles`, builds the import graph +
  per-file closure fingerprints, assigns every lintable file to exactly one
  target's program (include-roots + forward-import closure; `web-core` first so
  shared `core`/`shared` files match what projectService picks), asserts full
  coverage (the gate that replaces projectService's "every file resolves to a
  project"), fans out one worker per target with bounded concurrency, then
  splits results into the two failure categories and records per-file lint
  PASSes.
- `shared/worker.ts` — per-target worker. `createIncrementalProgram` →
  `getPreEmitDiagnostics` (+ persists the shared `.tsbuildinfo`) → ESLint
  `Linter.verify` with the program injected. One process per target so each
  single-threaded program build runs on its own core.

## The file universe comes from git, and is enumerated once

`run()` takes ONE `readTreeListing(root)` — a `TreeListing` whose files come
from `listRepoFiles` (`checks/core`) — and hands that value to every consumer:
`buildImportGraphs` filters it with `isLintable`, `findGlobalTriggerFiles` with
`isGlobalTrigger`, the program key with `isTscTrigger` and `isTsName`, and
`recordOuterReadSet` records facts over them. Nothing below the listing
enumerates: `import-graph.ts`, `fingerprint.ts` and `program-key.ts` only read
the bytes of files handed to them, which is why they stay synchronous.

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

`~/.singularity/worktrees/<wt>/check-<runId>.log` carries three greppable lines
per run, and they are the instrument every claim about this check is made on:

- `type-check: skipped N of M targets, program unchanged since last pass: …
(program keys <ms>ms)` — the per-target hit rate, and what the keys cost.
- `type-check: no program key for N target(s) — <target>: <why>; …` — only when
  some target could not be keyed at all.
- `type-check: <units> of <n> targets run concurrently (host CPU grant)` — only
  when the grant is narrower than the fleet.
- `type-check worker <target>: cpu 86.6s, maxRSS 2.4 GB` — one per worker that
  RAN (a skipped target has no line, by construction).

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
- Warm paths: tsc is incremental via `.cache/tsbuildinfo/<target>.tsbuildinfo`;
  lint reuses the global closure cache (only closure-changed files re-lint); and
  a target whose whole PROGRAM is unchanged runs no worker at all (below). A
  worker that crashes records no PASSes (re-lints next run).
- A new lintable file in **no** tsconfig `include` and reachable from **no**
  program fails the coverage gate. Since the universe is git-derived, such a
  file is genuinely repo source: add its dir to a tsconfig `include`. If it is
  not source, it does not belong in the git tree — delete it or gitignore it.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference


<!-- AUTOGENERATED:END -->
