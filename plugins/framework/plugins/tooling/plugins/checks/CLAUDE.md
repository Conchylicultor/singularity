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

A check that enumerates the repo's SOURCE FILES must get them from
**`ctx.repo()`** (below) — outside a check, from **`loadRepoFiles`** (exported
from `tooling/core`) — never a `readdirSync` walk that prunes directories by
name. Such a list is a guess at what `.gitignore` already states, and it is
always missing one: type-check's two copies both omitted `.cache/`, so a `.ts`
left in that gitignored directory counted as source and failed its coverage
gate. Both ask git for tracked + untracked-not-ignored — the same universe
`computeTreeHash` builds. The `no-adhoc-repo-walk` lint rule enforces it.

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
- **Leave the early read no spelling.** The contributions facet is handed the
  imported barrels and the naming the declaration pass over them settled as ONE
  value (`ExtractContext.imported`), so a reader cannot hold the barrels without
  the pass that names their slots. This began as a runtime count the facet
  refused to extract while zero; pairing the two turned the assert into a type.
  Without either, reading too early returns a smaller answer that looks correct
  — which is how this shipped.

`cacheSignature()` follows the same reasoning: a signature keys a verdict, it
cannot make one reproducible. If the verdict depends on something outside the
checkout and outside the signature, the right value is `null`, and the repair is
to remove the dependency rather than key around it.

## `runChecks()` has exactly one in-process caller

[`cli/plugins/check/cli/run.ts`](../../../cli/plugins/check/cli/run.ts), the `check`
command's own action. `build` and `push` both reach it by spawning that command.

A build process has already imported every plugin barrel, run the
slot-declaration pass, and warmed the codegen memos, so entries it recorded
in-process would carry all of that as invisible context — and the clean
subprocess push spawns would then hit those entries and skip the run it paid
for. Spawning makes build's ✓ and push's ✓ the same claim by construction. Held
by the `check-runner-safety` lint rule (bans the `runChecks` value import
elsewhere) plus a throw in `runChecks` when `isBuildProcess()`.

## A check that throws fails itself, never the run

If a check's `run()` throws, that check FAILs: it is named, its full stack is in
the transcript, and the result is fatal and never cached. Every other check in
the run still reports its own verdict. The conversion is
[`core/thrown-outcome.ts`](core/thrown-outcome.ts). Still, return `{ ok: false }`
(or `inconclusive`) for any failure you can name — a throw is reported as a bug
in the check. The runner's outer catch, which aborts the whole run, is for
runner-internal failures only — don't route check failures back to it.

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

## The check fan-out is gated, and the gate is an instrument

`runChecks()` gates its per-check fan-out with a `createSemaphore` (the repo's
canonical in-process bound). **The default width is unbounded** — one slot per
selected check, i.e. the behaviour that predates the gate — and `--jobs <n>` /
`SINGULARITY_CHECK_JOBS` narrow it. The env var is the one `build` and `push`
reach: neither calls `runChecks` in-process, they spawn the `check` command, and
the child inherits `...process.env`.

The width exists to make the timings mean something, not to tune throughput.
Unbounded, ~100 checks start within ~3s of each other, so every recorded
`durationMs` is mostly the wave's own length — twelve unrelated checks each
"cost" ~260s. So **`wallStart` is captured INSIDE the gate**, after it grants,
with the slot-wait recorded separately as `queuedMs` on the `end` record. Move
that `performance.now()` back outside and the queue reappears inside every
duration: intact-looking, measuring nothing.

`--jobs 1` is the point of it — a serial run is the only trustworthy per-check
cost table, and the way to corner a wedged check. **Only width 1**: read at width
4 the suite ranks `table-defs-in-schema-glob` second at 131s; serially it is
5.8s. A merely narrower run still reorders the table.

Why the default stays unbounded: wall clock improves monotonically with width
(~337s at one-per-core vs ~196s unbounded), while a run's self-reported durations
degrade 23×. Narrowing by default would tax every run for a fleet benefit nobody
has measured. Measure that first — see
[`research/2026-09-02-global-bounded-check-fan-out.md`](../../../../../research/2026-09-02-global-bounded-check-fan-out.md).

**The gate is NOT `options.grant`. Do not merge them.** One `Grant` is shared by
the whole run and wraps one `createSemaphore(units)` with no reentrancy, while
checks call it from *inside* their own bodies (`type-check` per tsc worker;
`layout-geometry` as `ctx.grant.run(() => browserPool.run(fn))`). Wrapping each
check in `grant.run()` therefore deadlocks at `units === 1` — which `acquireShare`
may legitimately return under load: the outer wrap holds the only slot while the
check's body waits for a slot only its own completion can free. Same bug class
`host-read-pool` hit (`research/perfs/2026-07-10-read-admit-wedge-stuck-git-loaders.md`);
here the answer is not to nest at all. It would also over-serialise: `grant.units`
sizes CPU-bound workers (~6 background), but most checks are spawn/IO-bound and
can correctly run wider. The grant bounds a check's heavy *children*; the gate
bounds how many *checks* run.

`checkStarted` is inside the gate too, so "started" keeps meaning "running" and a
hang is still `started − ended`. Queued checks are derived
(`selected − ever-started`), never recorded — a second source for that fact could
disagree with the start/end records. The bound's one real cost: a wedged check
eventually stalls the run behind it, where before its peers drained.

## The check thread is shared, and a run reports when it stalls

Every check in a pass runs on ONE JS thread. When code holds that thread, no
other check runs and no timer fires — so every check's `durationMs` in that
window grows by the stall, and a check's own wall-clock timeout can fire against
a service that is perfectly healthy. That is how fork-schema-drift's 5 s
Postgres connect failed on 2026-09-10. Measured with this watch, a full uncached
pass stalls its thread 10–14 times, and the longest stall is 24–42 s. The design
and the measured culprits are on the wiki track page "Check pass speed"
(read it with the `read_page` MCP tool: `block-c0e3f7dd-4943-432d-a631-d864fe623fe7`).

So each run carries a **thread watch**
([`core/thread-watch.ts`](core/thread-watch.ts)), opened and closed with the
progress run. A 50 ms timer measures how late it fires, and each tick drains the
JSC stack sampler (`infra/stack-sampler`, claimed as `check-runner`). A tick
late by ≥ 1 s is a **stall**. Every sample is attributed, stall or not, to give
a whole-run table of who used the thread. The sampler's rate is measured inside
stall windows, where the thread is busy by definition, and it turns sample
counts into milliseconds. With no stall, the tables give shares only.

Where it lands:

- **`check-progress.jsonl`**: a `stall` record per stall (top 3 owners with
  5-frame example stacks, plus the WHOLE `running` list), a `thread` record just
  before `done` (written even when nothing stalled), and `stalledMs` on each
  `end` (how much of that check's `durationMs` fell inside stalls). Read back,
  a missing `stalledMs` is `null`, never 0: older runs stalled too, they just
  weren't measured. Both `stall` and `thread` also carry a `kinds` tally
  (sample counts by innermost-frame kind) and a `cpu` reading
  (`process.cpuUsage()` delta); a stall's own record additionally keeps
  `leaves` (its busiest raw innermost frame names). Read back the same way as
  `stalledMs`: missing is `null`, never zeros.
- **The transcript** (`check-<runId>.log`): the full detail above the trailer —
  the whole-run owner table and each stall with its top 5 owners, 8-frame
  stacks, and the checks in flight.
- **The console**: one `⚠ check thread stalled …` line after the per-check
  lines, on a passing run too. It never changes the verdict.
- **`./singularity check --status`**: a `thread stalled N× so far` line under
  each open run.
- **Debug → Reports and the bell**, for a stall or run that misses the track's
  targets ([`core/stall-report.ts`](core/stall-report.ts)). One stall of ≥ 2 s
  files a `check-thread-stall` report the moment it closes, so a killed run
  still reports; one row per top owner, each new stall by it bumping the
  count. A run whose stalls add up to ≥ 20 s files one more at `finish()`, on
  a single `total` row. The thresholds are the targets (longest stall under
  2 s, total under 20 s), not today's numbers, so both fire on most full
  passes until the remaining stalls are fixed. Filing is async and can never
  change the verdict; the runner awaits it before returning so an exiting
  process does not lose it. The kind lives in
  `plugins/reports/plugins/check-thread-stall`.

  A CLI has no server, so the reports go through the **report outbox**
  (`plugins/reports/plugins/outbox`), which main's backend drains. Each entry
  carries this checkout's `git merge-base HEAD main` (read once per run, on the
  first report) and the repo files on the reported stacks (dependency and
  native frames left out). **Main drops the report when it has changed any of
  those files since that merge-base** — the stall may already be fixed there —
  and files it otherwise, including a stall this branch itself introduced.

**Reading an owner** ([`core/thread-attribution.ts`](core/thread-attribution.ts)):

- `check <plugin>`: a frame from that check's own `check/` directory was on the
  stack. That is sync work the check itself runs.
- `shared <fn @ path>`: the outermost source frame, i.e. an async function
  resumed after an `await`. **Its caller is not on the stack.** The stall
  record's `running` list is the link back to the checks that could have called
  it (e.g. the four that call the shared plugin-tree builder).
- `import`: module evaluation from `await import()`. The evaluated module's
  plugin is kept as detail ("of which: …"), so a long barrel-import chain reads
  as one owner rather than 800 slivers.
- `native during <activity>`: no source frame, but the sample was taken inside a
  `withThreadActivity` interval (`infra/stack-sampler`) — today only
  `barrel import`, with the barrel paths as detail. "During", not "caused by":
  the interval also covers other work that ran while the import awaited.
- `native <leaf>`: no source frame at all, and no activity running.

**Reading a stall's kind split**: an owner says WHOSE code held the thread;
`classifyLeaf` (`core/thread-attribution.ts`) says WHAT it was doing, sorting
each sample's innermost frame into `blocking-io` (a native `*Sync` frame — the
class this project exists to remove), `process` (Bun's spawn machinery),
`module-load` (the loader's own frames), `cpu` (ordinary JS), or `native`
(unclassified, never dropped). Paired with `cpu` (the `process.cpuUsage()`
delta over the same window — process-WIDE, not main-thread-only: Bun 1.3 has
no per-thread CPU clock, so a concurrently-busy Worker, e.g. `type-check`'s,
can inflate it), this tells apart a stall spent WORKING (`cpu` ≈ `lateMs`) from
one spent WAITING in the kernel (`blocking-io`-heavy, near-zero `cpu`) or not
scheduled by the OS at all (near-zero `cpu` *and* near-zero `samples`). The
transcript prints one line of each per stall.

A sync function whose last act is `return heavy()` loses its frame to JSC's
proper tail calls, and its samples go to the next frame out. An `async run()`
keeps its frame.

Two consequences for check authors:

- **A check's own wall-clock timeout must be longer than the longest stall a
  pass reports.** Otherwise it measures the other checks, not its service. Read
  the `thread` record of a recent uncached pass before picking a number.
- **The watch sees only the main thread.** Work a check moves onto a Worker
  (type-check's preparation) cannot show up here. That keeps it off the shared
  thread, but it is not free.

The watch names who held the thread. It does not give a check's true cost.
`--jobs 1` is still the tool for isolating one check (see the fan-out section
above).

## A check gets its files from `ctx.repo()`, and never blocks the thread

The watch above names the culprit of nearly every stall: a **blocking** call —
`readdirSync`, `existsSync`, `statSync`, `readFileSync`, `Bun.Glob.scanSync`,
`Bun.spawnSync` — made once per file across the tree. Alone each is fast. In a
pass it is not: an agent's check process runs at macOS background priority
(throttled disk, slow cores), so each call takes ~100× longer, and holds the
one thread every check shares for all of it.

So check code:

- **Gets the file set from `ctx.repo()`.** Loaded once per run, shared by every
  check: the universe the cache key covers (tracked + untracked-not-ignored),
  read off the key's own tree snapshot when the run has one. `all()`,
  `has(path)` and `under(dir)` answer in memory. Never list, walk or glob the
  repo yourself, and never run `git ls-files` per check.
- **Reads contents asynchronously**: `repo.read(path)`, or `node:fs/promises`.
  `read` is bounded by one run-wide gate, so `Promise.all` over thousands of
  paths is fine through it — never through raw `readFile`.
- **Yields in CPU loops** over thousands of items: `await yieldMacrotask()`
  (`packages/macrotask-yield`) every ~10 ms of work. Not `await
  Promise.resolve()` — a microtask never lets a timer run.
- **Makes `cacheSignature()` async** when it needs git, rather than
  `spawnSync`-ing it.

For an `inputKeyed` check, `ctx.repo()` records what it answers: `has` as an
existence fact, `under(dir)` as the membership of `dir/**`, `all()` as the whole
tree's, `read` as a content fact. A check that moves its reads onto it needs no
read-set code for them.

The runner holds up its end: each check starts on its own event-loop turn
(`createTurnQueue`), so ~100 checks' synchronous start-ups no longer run as one
block before any timer.

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
    - `framework/tooling.assertRepoPath`
    - `framework/tooling.loadRepoFiles`
    - `framework/tooling.pathsUnder`
    - `framework/tooling.RepoFiles`
    - `framework/tooling.repoFilesOver`
    - `framework/tooling/collected-dir.defineCollectedDir`
    - `framework/tooling/collected-dir.loadCollectedDir`
    - `infra/file-sink.defineFileSink`
    - `infra/paths.pruneWorktreeCheckArtifacts`
    - `infra/paths.REPO_ROOT`
    - `infra/paths.worktreeArtifacts`
    - `infra/spawn.getWorktreeRoot`
    - `infra/spawn.spawnCaptured`
    - `infra/stack-sampler.claimStackSampler`
    - `infra/stack-sampler.frameKey`
    - `infra/stack-sampler.StackFrame`
    - `infra/stack-sampler.StackSampler`
    - `infra/stack-sampler.ThreadActivity`
    - `packages/macrotask-yield.createTimeSlicer`
    - `packages/macrotask-yield.createTurnQueue`
    - `packages/semaphore.createSemaphore`
    - `plugin-meta/parse-utils.findImports`
    - `plugin-meta/parse-utils.lineAt`
    - `plugin-meta/parse-utils.maskSource`
    - `plugin-meta/plugin-tree.buildStructureTreeOnce`
    - `reports/check-thread-stall.CHECK_THREAD_STALL_KIND`
    - `reports/check-thread-stall.checkThreadStallMessage`
    - `reports/check-thread-stall.CheckThreadStallOwner`
    - `reports/check-thread-stall.CheckThreadStallPayload`
    - `reports/check-thread-stall.NO_SAMPLES_OWNER`
    - `reports/check-thread-stall.STALL_REPORT_MS`
    - `reports/check-thread-stall.TOTAL_REPORT_MS`
    - `reports/outbox.fileReportFromProcess`
    - `reports/outbox.mergeBaseWithMain`
  - Exports (types):
    - `CandidateSource`
    - `CheckCache`
    - `CheckRunProgress`
    - `CodeMatch`
    - `ContentHashMemo`
    - `DirFact`
    - `FileFact`
    - `FileSystemView`
    - `GitFactResult`
    - `GlobFact`
    - `ImportMatch`
    - `ListCandidateSourcesOptions`
    - `OutstandingCheck`
    - `ProgramFileList`
    - `ProgressRecord`
    - `QueryFact`
    - `ReadSet`
    - `RunChecksOptions`
    - `TreeSnapshot`
    - `TscProgram`
    - `ValidateOptions`
    - `ValidateResult`
    - `WarmBaseGitFacts`
    - `WarmBaseOutcome`
    - `WarmBasePublish`
  - Exports (values):
    - `checkCollectedDir`
    - `computeCheckSourceHash`
    - `computeTreeHash`
    - `currentScanView`
    - `fingerprint`
    - `gitGrepList`
    - `grepCode`
    - `grepImports`
    - `hashFileBytes`
    - `hashFileCached`
    - `isBuildInProgress`
    - `isBuildProcess`
    - `listAllChecks`
    - `listCandidateSources`
    - `listRepoFiles`
    - `loadTreeSnapshot`
    - `markBuildInProgress`
    - `materializeWarmBase`
    - `openCheckCache`
    - `publishWarmBase`
    - `readCheckProgress`
    - `readProgramFileList`
    - `realGitFacts`
    - `repoProgram`
    - `requestedJobs`
    - `runChecks`
    - `scopeOf`
    - `tsBuildInfoPath`
    - `validate`
- Sub-plugins:
  - **`app-css-utilities-in-sync`**
  - **`barrel-stubs-in-sync`**
  - **`bun-runtime`**
  - **`class-token-walk-single-source`**
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
  - **`no-disabled-flag`**
  - **`no-gitlinks`**
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
  - **`space-ramp-in-sync`**
  - **`table-defs-in-schema-glob`**
  - **`tailwind-scan-covers-classes`**
  - **`token-group-vars-in-sync`**
  - **`tsconfig-alias-single-owner`**
  - **`type-check`**

<!-- AUTOGENERATED:END -->
