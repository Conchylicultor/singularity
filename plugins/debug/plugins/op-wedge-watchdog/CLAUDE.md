# op-wedge-watchdog

Catches a **wedged `./singularity {build,check,push}` while it is still wedged**
and captures forensics from the live process, so the next occurrence produces
evidence instead of another dead end.

`bun cli/bin/index.ts {build,check}` intermittently never exits, holding its host
cpu-slots and (for a push, or a check nested in one) the global push mutex —
serialising every build and push on the machine. Four occurrences by 2026-07-19,
none before 2026-07-17. Three independent static sweeps of the whole build/check
path found nothing. The blocker was never analysis: **nobody had inspected a live
wedge with the right questions.** This plugin is that inspection, automated. See
[`research/2026-07-20-global-cli-op-wedge-capture-watchdog.md`](../../../../research/2026-07-20-global-cli-op-wedge-capture-watchdog.md).

It is modeled byte-for-byte on `debug/boot-watchdog` (config + `ReportKind` +
main-only scheduled sweep of a filesystem signal + web `KindView`), differing
only where the signal genuinely differs — see "Where boot-watchdog did not fit".

## Detection

Each tick sweeps the op-marker fleet via
`resolveActiveWorktreeOps()` (`@plugins/infra/plugins/worktree/server`), which
reads `~/.singularity/worktrees/*/ops/{build,check,push}.json`. It trips on an op
that is:

- **alive** — the reader already returns only markers whose pid passes
  `isPidAlive`, reaping dead ones as it scans. A dead pid is a crashed CLI, not a
  wedge.
- **running** — `phase === "running"`, with push phases taken from the *derived*
  truth (kernel flock + holder file), never a marker's self-asserted string.
- **over budget on GENUINE WORK** — `genuineWorkMs ≥ budgetMs` (default **15
  min**: well past any legitimate build on this box, well under the 8-17h wedges
  observed), where `genuineWorkMs = now − anchor − blockedMs`.

**Wedge-time is measured from the unified op-log, not from the marker.** The
marker's coarse two-state phase flips to `running` at the lock grant and then
never moves again — even while the op sits, for unbounded time, in the
duress-valve / host-CPU-grant admission wait that *follows*. Measuring
`now − startedAt` off the marker therefore reported a healthy build merely
queued for a host CPU grant as wedged, and reaped it. So the two on-disk
recordings are unified at the timing seam:

- the **op marker** (`infra/worktree`) supplies **process identity** — the pid to
  sample/reap, the `--inspect` URL for the JS probe, and liveness (`isPidAlive`,
  flock-derived push phase). That is all it is trusted for now.
- the **op-log** (`debug/profiling/op-log`, the one durable record) is the
  **wedge-time authority**: its `waits[]` list carries every host-resource wait
  (`build-lock`/`push-mutex`/`duress-valve`/`host-grant`) and `waitMs` folds them
  — including the currently-open wait — to the read clock. It was built to stop
  "a build parked in host-grant rendering as a motionless running bar."

`read-fleet.ts` reads `readOpRecords()` once per sweep, indexes the in-flight
records by `(opSlug, kind)`, and computes `genuineWorkMs = now − anchor −
blockedMs` where `anchor = record?.requestedAt ?? marker.startedAt` and
`blockedMs = record?.waitMs ?? 0`. So a build **parked** in host-grant has
`genuineWorkMs ≈ 0` and cannot trip; one **actually burning** for 16 min with no
waits has `genuineWorkMs ≈ 16 min` and trips. This is a **single uniform
formula, not a legacy branch**: when no op-log record correlates (a pre-op-log
CLI, or a parked op whose `requested` head was clipped by the op-log's 8 MB
bounded tail), `blockedMs = 0` falls out of the same formula and the marker
supplies the anchor — degrading to `now − startedAt`, which **still catches** the
wedge. It errs toward still-catching.

Only running ops trip. An op parked in `waiting-for-lock` for hours is a *victim*
of a wedge, not a wedge; filing on waiters would turn one wedge into a report
storm of its own queue while burying the culprit. The `phase === "running"` gate
is the cheap early-out and the flock-derived push-victim guard; the op-log
subtraction now makes it belt-and-suspenders (a push queued behind another is
pure `push-mutex` wait, so `genuineWorkMs ≈ 0` too), not the sole guard. The
culprit is always running — a leaked push mutex is held by a running push — so
this narrowing loses no wedge.

The pure trip decision is factored into `classifyOp(marker, record, now, budget)`
so it is unit-tested (`read-fleet.test.ts`) without stubbing the host's real op
markers / op-log; `readWedgedOps` is the thin fs-touching wrapper around it.

The marker reader is reused rather than reimplemented; `WorktreeOpInfo` gained a
`pid` field (the marker always carried it; the reader was simply dropping it) so
this plugin can identify and inspect the process without re-deriving paths or
re-parsing marker JSON that `infra/worktree` owns.

## Why main-only (no `perWorktree`)

Two independent reasons, either sufficient:

1. The wedged process is often the worktree's own `./singularity build` — the
   thing that restarts, and while wedged keeps down, the very backend a
   `perWorktree` job would run in. A backend cannot be relied on to observe the
   op holding it hostage.
2. The markers live on shared disk and wedges are cross-worktree by nature (they
   serialise the whole box). One sweeper over the shared fleet is sufficient and
   correct; N per-worktree sweepers would race to capture the same wedge and
   multiply the expensive `sample` calls.

Consequently the filed row's `worktree` column is always `main`, which is why the
subject lives in the **fingerprint** (`cli-op-wedge:<worktree>:<op>:<pid>`) and
the payload — never the row's own worktree. Same argument `boot-watchdog` makes.

## Dedupe — once per wedged process

Two layers, both keyed on `(worktree, op, pid)` — the identity of the stuck
*process*:

- A module-level `Set` in `monitor-job.ts` gates **both the capture and the
  filing**, and is marked *before* the capture runs so a slow `sample` cannot let
  the next tick start a second one against the same pid. This is what keeps a
  17-hour wedge to one report and one `sample` instead of ~1000 of each.
- The kind's `fingerprint` is `cli-op-wedge:<worktree>:<op>:<pid>`, so a re-file
  after a main restart collapses onto the same row and bumps `count`.

Pid is part of the identity deliberately: `(worktree, op)` alone would collapse
two genuinely different wedges onto one row and suppress the second — and the
second capture is the one that would confirm a pattern.

## Capture — the whole point

`server/internal/capture.ts` dumps, for a tripped op: `sample <pid> 10` (thread
states — settles spin-vs-block for good), the recursive child process tree
(**the decisive question: is a `git` child still alive?**), `lsof -p <pid>`, the
op marker plus the `check-progress.jsonl` tail, and a CPU-time **delta** sampled
twice ~5s apart.

The CPU delta matters: the prior investigation's "~95-100% CPU, state R" was a
misread of a single `%CPU` number, and it sent three sessions hunting a busy loop
that does not exist (every preserved `sample` shows all threads parked in
blocking syscalls). A verdict derived from a delta cannot be misread the same way.

**The verdict and the specimen are tree-aware.** The cpu-time delta is taken
from two whole-table `ps` snapshots, so it covers the marker pid AND every
descendant. The **specimen** — the process the JS interrogation and the reap
chase — is the max-ratio spinning member of marker∪descendants, falling back to
the marker when nothing spins. This is the 2026-07-22 m0gj lesson: a push's
marker pid was an idle push worker while the actual wedge was a *marker-less*
nested-check grandchild at 99% CPU (a push-nested check deliberately writes no
marker — `check.ts` gates it on `inheritedGrant()`; that design is kept, the
watchdog finds the wedge by evidence instead). `verdict: idle` therefore means
"no pid in the whole tree burns", and a marker-less descendant's own pre-armed
`--inspect=` URL is recovered from its argv (`parseInspectFlag`).

**Capture first, reap after.** The capture module itself is strictly read-only
on the specimen; once ALL evidence is banked (native capture + JS
interrogation), the monitor reaps the process — see "Reap" below.

**The `check-progress.jsonl` tail is deliberately NOT captured.** Reading it means
calling `readCheckProgress` from `checks/core` — the CLI's check runner. A static
import would make this the first server plugin to drag that whole runner into the
main backend's boot graph; the lazy `await import` that avoids the boot cost is
rejected by the `inline-import` boundary rule as an undeclared cross-plugin edge.
Neither price is worth paying: the decisive datum is the process tree, and
`check-progress.jsonl` stays readable via `./singularity check --status`, with
every dump recording the pid and both timestamps for hand correlation. If that
correlation ever becomes load-bearing, extract `readCheckProgress` + the
progress-log path into a leaf plugin both runtimes may import — do **not** widen
the boundary rule, and do **not** re-derive the path or re-parse the JSONL here.

**Failures are loud.** `captureOpWedge` returns per-step `failures` rather than
throwing, and a non-empty list is surfaced in the report title context, the task
body (`⚠️ PARTIAL`, with an explicit "do not read an absent section as an absent
finding"), *and* the Debug → Reports one-liner. A partial capture must never
render as a complete one — including in the list view, where a reader decides
whether to open it at all.

## JS interrogation — naming the hot function

CLI ops launch pre-armed under `bun --inspect` (cli/bin/inspect.ts); the op
marker records the ws URL as `inspect`, surfaced on `WorktreeOpInfo`. **The
probe targets the SPECIMEN**: the marker file's URL when the specimen is the
marker pid, else the URL parsed from the specimen's own argv — profiling the
idle marker while a descendant burns taught nothing (2026-07-22 m0gj). For an
armed wedge, after the native capture the monitor spawns
`scripts/js-interrogate.ts` (bounded, deadline-killed — same `runBounded`
discipline as every other diagnostic child), which runs the protocol that named
the wedge's mechanism on 2026-07-22
(`research/2026-07-22-global-cli-op-wedge-named-function.md`): stash `bun:jsc`
via dynamic import, JSC **internal** sampling profiler accumulated over the
probe window (the inspector's ScriptProfiler records 0 samples against a native
microtask storm — verified against a control), heap-stats delta, and a
protected-object **histogram**. A second `lsof` after the window pairs with the
trip-time one (does a socket vanish while the burn continues?). Raw JSON lands
in the capture dump; a compact summary (`topStacks`, `traceCount`, `heapDelta`)
rides the report payload, and the renderer calls out a dominant-stack match
with the known drain-site signature.

**HARD RULE: never `jscDescribe` / deep-introspect protected objects in a live
specimen.** That exact probe SIGTRAP-crashed the 2026-07-22 specimen
(`EXC_BREAKPOINT`; the crash .ips is preserved with that capture). The
histogram of constructor names is safe; describing the objects is
specimen-killing. Unarmed wedges (worktree branched before 12efa0e37) skip the
probe with an explicit `armed: false` marker — an absent probe must never read
as an empty one.

## Reap — capture-then-reap policy

Once every capture step has banked its evidence — **including when a step was
partial** (fleet health outranks a second try; the report says PARTIAL either
way) — the monitor reaps **the whole captured tree**: every descendant
deepest-first, then the marker pid, each SIGTERM → 5 s grace → SIGKILL
(`server/internal/reap.ts` `reapTree`). Before this policy one wedge gridlocked
every build and push on the box for hours; now the fleet unblocks ~2 min after
the budget trips.

Tree-wide because marker-only reaping was falsified on 2026-07-22 (m0gj): the
marker pid was an idle push worker, and killing only it orphaned the actually
burning nested-check grandchild at 99% CPU indefinitely. Descendants carry
weaker provenance than the marker (photographed possibly minutes earlier), so
each is re-verified against a fresh `ps` read and signalled only when its live
`{ppid, command}` still match the captured row — `vanished` and
`identity-mismatch` pids are never signalled. The marker pid's provenance is
the marker file plus this tick's liveness check, so it is reaped even when the
re-read fails: releasing the push mutex is the core value.

Reap safety is structural, not hopeful: the push mutex is a kernel flock on
`push.lock` (auto-released when the holder dies), host-semaphore cpu-slots are
flock fds with the same auto-release, op markers are reaped by every reader
once the pid is dead, and a push-nested check dying surfaces to its parent push
as an ordinary check failure. `survived` (alive after SIGKILL) and
`identity-mismatch` roll up as `some-survived` and are filed loudly. The `reap`
config toggle restores stakeout behavior when a human wants a live specimen.

## `duressExempt` — the monitor must not be shed by what it observes

The kind declares `duressExempt: true`. A wedged `./singularity push` holding the
global mutex is itself a leading *cause* of host duress, so the duress shed gate
would reliably drop the one report that explains the duress. The shed engine
names no kind — a kind opts itself out (same flag `duress-shed` and `sentinel`
use, for the same reason).

## Load-bearing literals

The config `name` `op-wedge-watchdog`, the job name
`debug.op-wedge-watchdog-monitor`, the report kind `cli-op-wedge`, and the source
`server-op-wedge-watchdog` are explicit literals — persisted config, report
dedup, and the `SERVER_REPORT_SOURCES` union depend on them; do not rename.

## Where boot-watchdog did not fit

- **No superseded/open split.** A boot event can be retroactively closed by a
  later attempt; an op marker has no such successor — it is either live or
  reaped. So there is one state, and one code path.
- **No gateway fleet read.** `boot-watchdog/read-fleet.ts` queries the gateway to
  tell "wedged now" from "torn down". Here the marker's own pid liveness answers
  that directly and authoritatively, so this plugin's `read-fleet.ts` sweeps the
  op-marker fleet instead. Same filename, different fleet.
- **Dedup is once-per-wedge, not re-file-every-tick.** `boot-watchdog` re-files
  open wedges each tick because the row `count` (≈ minutes wedged) is the useful
  signal and re-filing is free. Here re-filing would mean **re-capturing**, and
  `sample` on a box already in trouble is not free. Duration is recovered from
  `firstSeenAt` and the dump instead.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: CLI op-wedge report renderer: a one-line Debug → Reports summary for the cli-op-wedge kind (CPU verdict, live-child count, partial-capture marker), plus the op-wedge-watchdog budget/capture config registration. Op-wedge watchdog: a main-only per-minute scheduled job that sweeps every worktree's CLI op markers off shared disk and, for a `./singularity {build,check,push}` whose pid is alive past the budget (default 15 min), runs capture-then-reap: native forensics from the LIVE wedged process (sample, recursive child tree with per-pid CPU-delta ratios, lsof, whole-table twice-sampled CPU delta) naming the SPECIMEN — the max-ratio spinning member of marker∪descendants, which for a marker-less nested op is a descendant, not the marker — then a JS-level interrogation over the specimen's own pre-armed inspector, then reaps the whole tree (descendants deepest-first, identity-verified, SIGTERM→SIGKILL; marker last) so one wedge cannot gridlock the fleet nor leave a burning orphan, and files ONE deduped cli-op-wedge report per (worktree, op, pid). Duress-exempt, since a wedged op is itself a cause of host duress.
- Web:
  - Contributes: `ConfigV2.WebRegister`, `Reports.KindView` → `OpWedgeSummary`
  - Uses: `config_v2.ConfigV2`, `primitives/css/badge.Badge`, `primitives/css/inline.Inline`, `reports.Reports`
- Server:
  - Contributes: `ConfigV2.Register` "op-wedge-watchdog", `report-kind` "cli-op-wedge"
  - Uses: `config_v2.ConfigV2`, `config_v2.getConfig`, `debug/profiling/op-log.readOpRecords`, `infra/jobs.defineJob`, `infra/paths.PS`, `infra/paths.SINGULARITY_DIR`, `infra/paths.worktreeDataDir`, `infra/worktree.resolveActiveWorktreeOps`, `infra/worktree.WorktreeOpInfo`, `reports.recordReport`, `reports.ReportKind`
  - Register: `defineJob('debug.op-wedge-watchdog-monitor')`
- Core:
  - Uses: `config_v2.defineConfig`, `fields/bool/config.boolField`, `fields/int/config.intField`
  - Exports: Types: `OpWedgePayload`; Values: `OpWedgePayloadSchema`, `opWedgeWatchdogConfig`

<!-- AUTOGENERATED:END -->
