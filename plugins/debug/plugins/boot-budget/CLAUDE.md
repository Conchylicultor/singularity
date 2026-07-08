# boot-budget

Makes a **heavy server boot hook loud immediately** instead of invisible-until-a
-dataset-crosses-a-threshold.

Every backend boot re-pays all `onReady` work: main after each `./singularity
build`, **plus** every worktree agent backend on launch. Nothing structurally
distinguishes cheap registration from a multi-GB scan, so a hook that grows heavy
silently degrades every boot. This monitor is the runtime alarm from the boot-time
plan (`research/2026-07-08-global-bounding-boot-time-work.md`, "Enforcement /
visibility"): a cheap per-worktree scheduled `defineJob`
(`debug.boot-budget-monitor`) reads the post-boot profile once each tick and files
a deduped `boot-budget` report — which files an investigation task through the
existing reports→tasks sink — for every boot hook or warmup span over its
per-phase wall-time budget. Modeled byte-for-byte on `debug/read-set-shrink` and
`debug/op-rate` (durable signal → `ReportKind` → deduped task via a per-worktree
scheduled job).

## What it monitors

Each tick, `getProfilingData()` (from `server-core/core`) is pulled once and every
span is checked against its phase's budget (`budgetForSpan`):

- **per-plugin boot hooks** — spans with `span.plugin` set in the
  `onReadyBlocking`, `onReady`, or `onAllReady` phase (named `<phase>:<pluginId>`).
  Requiring `span.plugin` cleanly excludes the whole-phase wrapper spans (e.g. the
  aggregate `onReadyBlocking` span, recorded with no plugin) so a report always
  attributes to a specific plugin, never the aggregate phase.
- **warmup spans** — spans named `warmup:<name>` (the declared heavy deferred
  category from `defineWarmup`, landing in Phase 1 of the plan). Matched by id
  prefix **before** the phase branches, because a warmup may carry any phase
  (warmups drain after `onAllReady`) — its id, not its phase, decides its budget.

A span that is neither (register/migrations/route-population/etc.) is skipped.

## Dedup — why a per-process "already reported" Set

Boot happens **once per process**, so the profile is static after boot and the
monitor re-reads the same over-budget spans every minute. A module-level
`Set<string>` of span names already filed this process (`reported`) makes a given
`(worktree, span-name, boot-epoch)` file **at most once** — the process lifetime
IS the boot epoch, so the Set is inherently per-boot-epoch. Across a restart the
module reloads with a fresh Set, so a chronically-slow hook re-files, collapsing
onto its stable fingerprint row (`boot-budget:<spanName>`) whose `count` becomes
"number of boots this hook was slow".

This is the **pull-signal analog of op-rate's module-level baseline maps** (which
gate its re-fire on unchanged profiler data). boot-budget has no event stream to
drain — unlike `read-set-shrink`, which drains an accumulator fed by a seam — so
it has **no accumulator**: it pulls a static profile and the guard is "already
reported this boot" rather than a delta or a drain. That is the one intentional
structural deviation from the read-set-shrink template.

## Budgets (config_v2, mirroring opRateConfig)

`enabled = true`, plus a per-phase wall-time budget read live each tick via
`getConfig` and editable in Settings → Config:

- `onReadyBlockingBudgetMs = 500` — the hard barrier before the backend serves
  (migrations / registry only), so it must stay cheap → tightest.
- `onReadyBudgetMs = 500` — runs concurrent with request serving on the single
  event-loop thread, so a long span competes with first requests.
- `onAllReadyBudgetMs = 500` — post-serving barrier.
- `warmupBudgetMs = 2000` — looser, because warmups are the declared heavy
  deferred category (throttled, run after the barrier), so they legitimately run
  longer.

Per-phase (not a single floor) mirrors op-rate's per-kind budgets: the phases have
very different natures and a single floor would drown the signal.

## Wall-time only — event-loop-block detection is a follow-up

A long span is **not** always a blocked event loop: a span can be long because it
*awaited IO* (flat RSS) rather than *burned CPU* (RSS spikes). This monitor
budgets on span **wall-time** only. As free authoritative context it carries the
phase-boundary memory checkpoints (`recordMemoryCheckpoint`: `boot-start`,
`after-onReadyBlocking`, `after-onReady`, `after-onAllReady`) into the report so a
human can read the phys_footprint jump across a phase to distinguish heavy CPU
work from IO wait.

**Follow-up:** true event-loop-block attribution (sampling event-loop delay during
boot via `perf_hooks.monitorEventLoopDelay` or a drift sampler and attributing it
to a phase) is intentionally deferred — there is no existing post-boot event-loop
-delay signal to read, and this task ships the wall-time budget cleanly rather than
half-building a loop sampler. See the plan's "Enforcement / visibility" section.

> The config `name` `boot-budget`, the job name `debug.boot-budget-monitor`, and
> the report kind `boot-budget` are load-bearing explicit literals — persisted
> config and report dedup depend on them; do not rename.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Boot-budget report renderer: a one-line Debug → Reports summary for the boot-budget kind, plus the per-phase budget config registration. Boot-budget monitor: a cheap per-worktree scheduled job that reads the post-boot profile once and files a deduped boot-budget report per server boot hook (onReadyBlocking / onReady / onAllReady) or warmup span whose wall-time exceeds its per-phase budget, so a heavy boot hook is loud immediately instead of invisible-until-threshold.
- Web:
  - Contributes: `ConfigV2.WebRegister`, `Reports.KindView` → `BootBudgetSummary`
  - Uses: `config_v2.ConfigV2`, `primitives/css/badge.Badge`, `primitives/css/inline.Inline`, `reports.Reports`
- Server:
  - Uses: `config_v2.ConfigV2`, `config_v2.getConfig`, `infra/jobs.defineJob`, `reports.recordReport`, `reports.ReportKind`
  - Register: `defineJob('debug.boot-budget-monitor')`
- Core:
  - Uses: `config_v2.defineConfig`, `fields/bool/config.boolField`, `fields/int/config.intField`
  - Exports: Types: `BootBudgetPayload`; Values: `bootBudgetConfig`, `BootBudgetPayloadSchema`

<!-- AUTOGENERATED:END -->
