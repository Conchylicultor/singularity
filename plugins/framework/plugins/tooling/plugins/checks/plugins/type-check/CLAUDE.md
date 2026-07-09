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
  builds the import graph + per-file closure fingerprints, assigns every
  lintable file to exactly one target's program (include-roots + forward-import
  closure; `web-core` first so shared `core`/`shared` files match what
  projectService picks), asserts full coverage (the gate that replaces
  projectService's "every file resolves to a project"), fans out one worker per
  target with bounded concurrency, then splits results into the two failure
  categories and records per-file lint PASSes.
- `shared/worker.ts` — per-target worker. `createIncrementalProgram` →
  `getPreEmitDiagnostics` (+ persists the shared `.tsbuildinfo`) → ESLint
  `Linter.verify` with the program injected. One process per target so each
  single-threaded program build runs on its own core.

## Host-wide worker budget (two lanes)

Each worker builds a full multi-GB TS program. The fleet is bounded **host-wide**,
not per build: before this gate, N overlapping agent builds each spawned
`targets.length` workers, so 4–5 concurrent builds put 30–40 multi-GB processes on
a 64 GB box and the machine thrashed (see
`research/2026-07-09-global-type-check-worker-host-budget.md`).

The bound is a lane-keyed `packages/host-semaphore` pool of `B` flock slot files
(`~/.singularity/type-check-worker-{interactive,background}-slots/slot-0 … slot-(B-1)`).
The check acquires its whole share once, up front (`pool.acquireShare(max)` — at
most one broker per build), then fans out at exactly `share.slots` concurrency.

- **Two lanes, by who is waiting.** `interactive` = main build + push (a human is
  blocked); `background` = agent build + direct agent check. The CLI classifies
  the origin and publishes `SINGULARITY_LANE`; this check reads it (unset ⇒
  `background`, the safe default — bounded, never exempt). The lane is **not** the
  branch: push runs its checks on the rebased *agent* branch yet must stay
  interactive, so a `branch === "main"` gate would have wrongly demoted it. Each
  lane has its own pool of `B`, so the stated host ceiling is **`2·B` workers**;
  the common case (no main build, no push in flight) runs at most `B`.
- **`B = max(1, min(floor(cpus/2), floor(0.5·totalmem / 2.7 GB)))`.** On an
  18-cpu / 64 GB host: `min(9, 12) = 9`. `cpus/2` (not `cpus−1`) leaves headroom
  for the ~16 worktree backends, postgres, and concurrent vite builds.
- **`targets.length` is NOT a term in `B`.** It bounds this build's *request*
  (`max = min(targets.length, B)`), not the host's slot-file set. `B` names the
  slot files, so it **must be identical in every process** — a mismatch (one
  process sizing 8 slots while another locks `slot-8`) silently overcommits. That
  is also why there is **no env override for `B`**: `os.cpus()` / `os.totalmem()`
  are stable per host, and an override reintroduces the mismatch risk.
- **Demotion is a separate axis, unchanged.** `workerDemotion()` still keys on
  `branch === "main"`, so push's workers stay darwinbg-demoted exactly as before.
  Admission (this budget) and scheduling priority (demotion) are orthogonal.
- **Contention is legible.** When the share is reduced (`share.slots < max`) or
  genuinely waited for, the check writes one plain stderr line
  (`type-check: 3/8 worker slots in the background lane (waited 12.4s)`). Checks
  run under `Promise.all`, so it must never be a blocking log or a progress bar.
  The wait term is thresholded (`WAIT_NOTE_MS`), not `waitMs > 0`: `onWait` also
  times the in-process fast-path sweep, which costs ~0.25 ms on a fully idle pool,
  so a bare `> 0` would print the note on every run and train the eye to ignore it.

## Invariants / caveats

- **tsc still checks shared `core` files under every program that includes
  them** (web + server + central) — same as the old typescript check. Lint runs
  **once** per file (single owner) to avoid duplicate violations.
- The flat config comes from the shared builder
  `@plugins/framework/plugins/tooling/plugins/lint/core` (`buildLintConfig`),
  the same one the root `eslint.config.ts` uses — editor and check can't drift.
- Warm paths: tsc is incremental via `.cache/tsbuildinfo/<target>.tsbuildinfo`;
  lint reuses the global closure cache (only closure-changed files re-lint). A
  worker that crashes records no PASSes (re-lints next run).
- A new lintable file in **no** tsconfig `include` and reachable from **no**
  program fails the coverage gate — add its dir to a tsconfig `include`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference


<!-- AUTOGENERATED:END -->
