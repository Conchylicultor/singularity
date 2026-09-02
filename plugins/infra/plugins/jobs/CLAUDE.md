# jobs

## Liveness: shared fate, not a lease

**"Is this job's worker alive" is answered by Postgres, never by a clock.** For a
handler's whole lifetime `withJobLock` (`server/internal/job-lock.ts`) holds a
session-scoped advisory lock on the graphile job id, on a **direct**-PG connection
(5433 — pgbouncer's tx pooling would not preserve the session). Postgres releases
it during backend teardown, so it vanishes the instant the owner dies (SIGKILL,
OOM, panic, `process.exit()`). The sweeper reclaims a locked row **only** when
that lock is absent from `pg_locks`. We can do this because we have shared fate
with the queue — one instance, one local PG; a general job library cannot, which
is the only reason leases exist elsewhere.

**Never reintroduce a duration-based threshold, and never infer liveness from how
long `locked_at` has been set.** A timeout cannot tell "dead" from "slow" or "host
was asleep". The previous 5-minute lease cleared `locked_at` on live rows, so
graphile re-dispatched jobs **while the handler was still running** — ~25 jobs
stolen in 8 days (nightly backups, DB forks, `./singularity push`), worst at 69
min; for non-idempotent handlers that is corruption, not wasted CPU. Its keepalive
renewed `WHERE locked_by = 'undefined'` and never matched a row — silent for three
months. A 6-hour handler is exactly as alive as a 200 ms one. Details:
[`research/2026-07-30-jobs-exact-liveness-advisory-locks.md`](../../../../research/2026-07-30-jobs-exact-liveness-advisory-locks.md).

**The sweeper's `LOCK_ACQUIRE_GRACE` (30s) is not a lease.** Graphile stamps
`locked_at` in `get_job`; we take the lock a few ms later in `dispatch()`, and a
row inside that gap would look abandoned. The grace bounds **acquisition latency**
— a constant of the dispatch path — and never grows with handler duration. Wanting
to raise it because a job is "slow" is reaching for a lease again; the answer is
no. Every reclaim is loud (`console.warn` + report); silent reclaims are what hid
the original bug.

Reading it:

- `queryRunningJobs()` and the `jobs-list` resource expose `alive` per locked row
  (Debug → Queue shows a **no worker** badge). `false` = owner died, or dispatch is
  inside the sub-second acquisition window — never "has been running a while".
- The `pg_locks` key encoding lives once, as `jobLockHeldExpr` in
  `introspection.ts` (which owns the graphile coupling). Compose it, don't re-type
  it: the single-bigint form splits the key across `classid`/`objid` with
  `objsubid = 1`, and a copy that drops the `datname` guard reads a sibling
  worktree's locks.
- `deadJobPredicate` / `readyPredicate` test `locked_at IS NULL` — presence, not
  age. Unaffected; keep it that way.

`POST /api/events-test/crash-recovery` is the regression test and asserts both
halves through the public introspection API: **no-steal** (a row locked 2 min whose
lock is held by a *live* connection survives a forced sweep — the case the old
harness could not express) and **reclaim** (destroy the socket, wait for the lock
to drop, sweep, handler re-runs).

Three more harnesses beside it, same plugin, same verdict shape:

- `POST /api/events-test/queue-lock-no-steal` — the queue-level twin, guarding the
  riskier half of the same sweep: **no-steal** (a queue whose job's advisory lock
  is live survives a forced sweep and no second job in it is fetched — clearing it
  would put two jobs in a lane that exists to hold one) and **reclaim**.
- `POST /api/events-test/serial-queue` — four jobs in one `serial` lane, the first
  held open. Asserts they share one non-null `job_queue_id`, at most one is locked,
  and the other three have `locked_at IS NULL` — never fetched, holding no slot.
- `POST /api/events-test/cron-dedup` — cron-shaped inserts collapse onto one
  pending row with an unmoved `run_at`; a manual `enqueue()` shares that row.
  Drives `add_job` with the cron path's arguments rather than waiting on real
  ticks, so the key format is restated there rather than read from
  `buildCronItems`.

## Retry policy & non-retryable failures

A failing job is retried up to `maxAttempts` (default `DEFAULT_MAX_ATTEMPTS`,
overridable per-job via `defineJob({ maxAttempts })` or per-enqueue via
`enqueue(input, { maxAttempts })`), then permanently-failed: graphile leaves the
row in `graphile_worker._private_jobs` with `attempts >= max_attempts`, which the
dead-job GC archives into `dead_jobs` and queue-health surfaces as a dead-letter.

Retries only earn their keep when the failure is **transient** (DB hiccup,
network blip, lock contention) — a later attempt might succeed. When a failure is
**deterministic** (the same stored input will fail identically every time —
schema/contract drift, a permanently-invalid payload), retrying is pure waste,
and for a frequently-re-enqueued job it churns the queue ×`maxAttempts`.

For that case, throw a **`NonRetryableError`** (exported from the server barrel)
from the job's `run`. The worker collapses the row's retry budget so graphile
dead-letters it after the **single** current attempt instead of burning the full
budget — while keeping the failure loud and visible (it is still reported and
still lands as a dead-letter). Use it ONLY for failures that cannot succeed on
replay; a plain `Error` remains the right choice for anything retry could fix.

## Hold class: what bounds this handler

`defineJob({ hold })` is required, and answers exactly one question: **how long
may ONE RUN of this handler hold a worker slot?** Not how long the workflow takes
— `ctx.waitFor` / `ctx.sleep` RETURN from `run` and release the slot, so a
workflow may span days while every one of its runs is `instant`.

Declare it from what **bounds** the handler, never from its observed mean. A
model call with a 30 s timeout is `seconds` however fast it usually returns.

| `hold` | the bound is | how a reviewer checks it | slots |
|---|---|---|---|
| `instant` | no blocking I/O — indexed reads/writes, in-memory work | no network, no spawn, no model call | **8** |
| `seconds` | a timeout the handler passes itself (`timeoutMs`, `HAIKU_TIMEOUT_MS`) | `grep timeoutMs` in the handler | **6** |
| `minutes` | nothing shorter than the work — subprocess, `pg_dump`, Chromium, archive upload, an open-ended step machine | does it spawn, render, or upload? | **4** |

The boundary is chosen to be checkable and stable, not numerically optimal: with
utilization this low, every cutoff across two orders of magnitude buys the same
milliseconds. What matters is that the partition exists at all. Queueing delay
scales with the *second moment* of service time, not its mean — measured over 41
minutes on main, `E[S] = 978 ms` while `√E[S²] = 19,168 ms`, so one heavy job
type set the wait for everything behind it. `queue-wedged` exists because four
long handlers took all four slots and everything behind them stopped, observed at
40+ minutes.

There is one declaration and no second field: `hold` picks both the reservation
tier and the deadline that aborts `ctx.signal`. A lane and a budget cannot
disagree if there is only one thing to declare.

### The deadline is a SIBLING of the ceiling, not the same number

| `hold` | `ceilingMs` (work) | slot-hog report | `deadlineMs` (hold) | zombie |
|---|---|---|---|---|
| `instant` | 10 s | 30 s | 60 s | 90 s |
| `seconds` | 2 min | 5 min | 10 min | 10 min 30 s |
| `minutes` | 30 min | 30 min | 60 min | 60 min 30 s |

An earlier version of this section promised the ceiling would *become* the
deadline. It must not. **`ceilingMs` bounds WORK (`durationMs − waitMs`); a
deadline can only ever be measured on wall-clock HOLD**, because at the instant
the timer fires nothing yet knows how the elapsed time split. Those quantities
genuinely differ — that is what `queue-slot-blocked` exists to report — so
aborting on hold at the work ceiling would kill conforming handlers for waiting
on an admission gate entered after dispatch. The gap between the two numbers is
the statement of how much gate wait we are willing to believe.

`queue-slot-hog` reports at a fraction of the deadline (strictly below 1), so
warn-before-kill holds for every class at every settable config value.

### What the deadline does, instant by instant

- **at `deadlineMs`** — `ctx.signal` aborts with a `JobDeadlineExceededError`,
  and a `job-deadline-exceeded` report is filed. **Nothing else.** The dispatch
  does not return, the advisory lock is not released, the row is not touched.
- **shortly after** — a handler that threaded the signal into what it awaited
  unwinds. Ordinary job failure from here: lock released, slot freed, reported,
  retried. A run aborted on attempt ≥ 2 dead-letters instead of burning
  `maxAttempts × deadline` of slot time.
- **+30 s, still unsettled** — `job-zombie`. The slot is **forfeited**: written
  off for the life of this process. The row is still untouched, and its lock is
  still held by this live backend, so the sweeper provably will not reclaim it.

### Forfeit is accounting, not recovery

**Forfeiting a slot touches no row, releases no lock, and stops no handler.** It
records one fact — this slot is gone until the process ends — so that
`usableSlots(runner)` can be counted, the floor below can be checked, and Debug
→ Queue can stop calling a written-off run *running* (it shows a `forfeited`
badge beside `no worker`; the two are opposites — `no worker` means nobody is
there, `forfeited` means somebody is and we stopped waiting).

**This paragraph is the one that stops someone "fixing" forfeit into a
reclaim.** The zombie still holds its advisory lock, and that is not an
oversight — it is the whole mechanism. The lock is what tells the stuck-lock
sweeper the row still has an owner. Release it (or clear `locked_at`) and the
sweeper reclaims a row whose handler is still running, graphile re-dispatches
it, and a possibly non-idempotent handler runs twice: exactly the corruption the
age-based lease caused, ~25 stolen live jobs in 8 days. A running promise cannot
be un-awaited. The abort was the only lever, and forfeit is what we do when it
did not work.

`disarm()` clears the entry, so a zombie that eventually settles un-forfeits
itself and its slot comes back — the only way short of a restart that it does.

### The floor, the crash and the latch

Written-off slots accumulate, and at some point the pool can no longer do the
work only it can do. That point is: **the runner serving the longest hold class
has fewer than 2 usable slots.**

Both halves are derived from the class table, never spelled — the runner is
`RUNNERS`' single entry whose `serves` includes the last of `HOLD_CLASSES`
(`forfeit.ts` throws at module eval if the ladder ever grows a second one,
because the condition would then have to be about their combined capacity).

Why *that* runner and why *2*: it is the only one that can serve `minutes`, so
DB forks, conversation spawns, builds and backups have nowhere else to go — a
shorter class inherits a longer class's idle slots, never the reverse. One
usable slot means the next long job to arrive consumes that class's entire
capacity. The old "one slot lets a long job block every monitor" argument no
longer needs making separately: monitors are `instant`, and the narrowest runner
already reserves slots only they can reach.

On the trip, the backend writes its report **synchronously to disk** and calls
`process.exit(1)`. Exiting is the point: Postgres drops every advisory lock
during backend teardown, so the next boot's sweeper reclaims those rows — this
time provably, their owner no longer exists — and the work re-runs.

- **A narrower runner going fully forfeited is a report, not a crash.** Its work
  still reaches the wider runners (the task lists are nested), so the pool is
  degraded, not dead.
- **Three floor exits within an hour suppress the fourth** — report, and stay
  up. An automatic restart that fixes nothing is worse than an honest wedge. The
  latch survives the exit as one small JSON file under `jobs/data-dirs`. Read
  that file's comment before pattern-matching its timestamps onto the banned
  lease: it governs **our own restart policy** and makes no claim about whether
  any worker is alive.
- **The respawn is lazy, not automatic.** The gateway does not restart an exited
  backend (`gateway/worktree.go`'s `onBackendExit` just marks the worktree
  idle); the next proxied request spawns a fresh one. So a worktree nobody is
  looking at stays down until someone looks — acceptable, since its widest
  runner was dead, but the floor crash is not a self-healing restart.

The report is one kind, `job-slot-floor`, with a discriminated
`action: "crashed" | "degraded"` — one condition, two honest arms. It reaches
the next boot through `reportServerFatalSync`, the synchronous twin of
`reportServerError`: `recordReport` is a Postgres write and the caller's next
statement is the exit, so it takes the same durable path a crash does (one
appended JSONL line, replayed on the next boot) and adds only that the line
names its own kind.

**There is no `Promise.race`, and there must never be one.** Racing would let the
wrapper return while the handler still runs — releasing the lock, letting the
sweeper reclaim the row, letting graphile re-dispatch a possibly non-idempotent
handler alongside its own zombie. The timer aborts a signal; the slot frees only
when the handler actually settles.

**This is not the liveness inference banned at the top of this file.** That claim
is third-person — "this row has been locked T, so its owner is dead, so I may
re-dispatch it". A deadline is first-person: *I* have been running this handler
for T and *I* am giving up on it. The process making the claim holds the lock, so
it cannot steal from itself, and it moves no row.

`jobs/plugins/deadline-audit/` owns the three report kinds; `jobs` announces on a
`defineReportSink` seam rather than naming `reports` (which already imports
`jobs`).

### The reservation is at FETCH, never after dispatch

`RUNNERS` (`core/hold.ts`) is three graphile runners over nested task lists —
`floor` serves `instant` only, `mid` adds `seconds`, `wide` adds `minutes` plus
the legacy task. graphile's fetch query partitions on `task_id = any($2::int[])`,
so **a runner physically cannot see a task identifier absent from its own
`taskList`**. Two of the eight slots are unreachable by anything that can run for
minutes, and the heavy ceiling stays at 4 — exactly what the single pool allowed.

That placement is the whole design, and it is the lesson `serial` already
encodes above: an in-process gate entered **after** graphile hands over a job
turns one stuck job into N stuck slots. A "lane" implemented as a semaphore
inside `dispatch()` would reproduce that bug wholesale. Nesting rather than
disjoint queues means a shorter class always inherits a longer class's idle
slots, so the only capacity ever stranded is the floor's two.

`priority` (lower wins) then decides preference *inside* a runner, so a class's
own tier fills before it spills into a narrower one. Priority alone could never
have fixed this — it reorders *pick* time, never *hold* time.

### Conformance is measured on WORK, not on hold

A job's slot-hold is substantially **not a property of the job**. `jobs.dead-gc`
was measured holding a worker slot for **77 seconds while doing 254 ms of work**;
the remainder was blocked on `background-tx-acquire`, an admission gate entered
*after* graphile had already handed it a slot. `debug.session-divergence-monitor`:
25.6 s hold, 4.2 s work. `mail.sync-tick`: 85% wait.

So the class ceiling is applied to **work time = `durationMs − waitMs`**
(`debug/slow-ops`, `resolve-threshold.ts`), and only for the `job` span kind —
every other kind is still judged on wall-clock. Comparing hold would file a
slot-hog report against a correctly-classified `instant` job every time the DB
background lane got busy, punishing it for someone else's congestion and training
every author to inflate their class until the signal is worthless. Do not "fix"
this back to `durationMs`.

The worked example is `page.attachment-block.reconcile`: a 1050 s `max_ms` in
`slow_ops` argued for `minutes`, but the handler is one indexed `SELECT` and an
indexed `set()` per block — no network, no spawn, no model call, so `instant`.
The tail was gate wait plus an unbatched loop. If its *work* ever does pass 10 s,
the report names the real defect instead of blessing it with a bigger class.

Hold ≫ work is its own signal, and `debug/queue-health` reports it separately:
"held a slot 77 s to do 254 ms of work, blocked on `background-tx-acquire`" names
a real bug where "slow job" does not.

### Reclassifying later is safe by construction

`repointHoldTasks()` runs on every boot, before the runners start, and is written
as a standing invariant rather than a migration: **a pending row sits on the task
and priority its `jobName`'s current class declares**. Change a job's `hold` and
its already-queued rows move on the next boot. Locked rows are left alone — they
finish where they are, and a retry lands re-pointed.

The legacy `jobs.run` task stays registered on the wide runner forever, so a row
written by an older backend or mid-deploy can never strand on a task no runner
serves. It reads as `minutes`, the most conservative tier.

### Nothing checks that a class is honest — deliberately

The enforcement ladder here stops at rung 2 and resumes at rung 4. `hold` is
required, so a partial migration is not expressible (tsc); a job whose *work*
exceeds its class ceiling files a report naming itself, every tick, until it is
reclassified or fixed (loud runtime), and a run that overruns the class's
*deadline* is aborted outright.

Rung 3 is empty on purpose. An earlier draft proposed a reviewed membership file
listing which jobs may claim which class. Against a duration axis that file is a
static restatement of a *runtime* fact, editable by every plugin that adds a job
and verifiable by nobody. The truth is measured, so it is enforced where it is
observable.

What IS checkable is the wiring, and that is checked: `jobs:no-raw-addjob`
confines both the row insertion and the bare `"jobs.run"` task literal to one
file each, because a hand-typed identifier is a row that silently lands in the
widest tier and escapes its reservation with no type error and no symptom.

Design, measurements, prior art and the risks to watch:
[`research/2026-08-19-global-job-hold-class-reserved-slots.md`](../../../../research/2026-08-19-global-job-hold-class-reserved-slots.md).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Durable background jobs primitive built on graphile-worker. Plugins declare jobs via defineJob and enqueue via job.enqueue.
- Load-bearing: yes
- Server:
  - Contributes:
    - `resource.declare` "jobs-list"
    - `resource.declare` "dead-jobs"
    - `fork-schema-data-exclusion` "graphile_worker"
  - Uses:
    - `database.db`
    - `database/admin.connectionString`
    - `database/admin.ExcludeSchemaDataFromFork`
    - `database/sql-column.parsedJson`
    - `database/sql-column.parsedText`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `primitives/log-channels.Log`
  - DB schema:
    - `plugins/infra/plugins/jobs/server/internal/queue-schema.test.ts`
    - `plugins/infra/plugins/jobs/server/internal/queue-schema.ts`
    - `plugins/infra/plugins/jobs/server/internal/tables.ts`
  - Exports (types):
    - `BacklogJobStat`
    - `DeadJobStat`
    - `DefineJobSpec`
    - `DurableHooks`
    - `EnqueueOpts`
    - `EnqueueTx`
    - `ForfeitedSlot`
    - `HoldClass`
    - `HoldClassSpec`
    - `JobCtx`
    - `JobDeadlineEvent`
    - `JobFactory`
    - `JobSlotFloorReport`
    - `QueueBacklogStat`
    - `QueueClassBacklogStat`
    - `RegisteredJob`
    - `RunnerSpec`
    - `RunningJobStat`
    - `ScheduleSpec`
    - `SerialSpec`
  - Exports (values):
    - `abortDurableRun`
    - `ALL_JOB_TASKS`
    - `ceilingMsFor`
    - `deadJobsResource`
    - `deadlineMsFor`
    - `DEFAULT_MAX_ATTEMPTS`
    - `defineJob`
    - `getAllRegisteredJobNames`
    - `getForfeitedSlots`
    - `getJobHold`
    - `getJobSlowThresholdMs`
    - `HOLD_CLASSES`
    - `HOLD_SPECS`
    - `HoldClassSchema`
    - `holdForTask`
    - `installQueueSchema`
    - `isJobDeadlineExceededError`
    - `isSuspendSignal`
    - `JOB_SLOT_FLOOR_KIND`
    - `JobDeadlineExceededError`
    - `jobDeadlineSink`
    - `jobsListResource`
    - `LEGACY_JOB_TASK`
    - `NonRetryableError`
    - `priorityFor`
    - `queryBacklogByJobName`
    - `queryDeadJobStats`
    - `queryQueueBacklog`
    - `queryRunningJobs`
    - `QueueSchemaMissingError`
    - `reachableSlots`
    - `RUNNERS`
    - `taskFor`
    - `TOTAL_JOB_SLOTS`
    - `UNSAFE_getRegisteredJob`
    - `UNSAFE_installDurableHooks`
    - `UNSAFE_sweepStuckLocks`
    - `usableSlots`
  - Register:
    - `defineJob('jobs.resume')`
    - `defineJob('jobs.dead-gc')`
  - Resources:
    - `dead-jobs` (invalidate)
    - `jobs-list` (invalidate)
  - Routes:
    - `GET /api/jobs`
    - `GET /api/jobs/dead`
    - `POST /api/jobs/:id/retry`
    - `DELETE /api/jobs/:id`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `DeadJobRow`
    - `DeadJobsPayload`
    - `HoldClass`
    - `HoldClassSpec`
    - `JobRow`
    - `JobsPayload`
    - `JobState`
    - `RunnerSpec`
  - Exports (values):
    - `ALL_JOB_TASKS`
    - `cancelJob`
    - `ceilingMsFor`
    - `DeadJobRowSchema`
    - `DeadJobsPayloadSchema`
    - `deadJobsResource`
    - `deadlineMsFor`
    - `HOLD_CLASSES`
    - `HOLD_SPECS`
    - `HoldClassSchema`
    - `holdForTask`
    - `JobRowSchema`
    - `jobsListResource`
    - `JobsPayloadSchema`
    - `JobStateSchema`
    - `LEGACY_JOB_TASK`
    - `listDeadJobs`
    - `listJobs`
    - `priorityFor`
    - `reachableSlots`
    - `retryJob`
    - `RUNNERS`
    - `taskFor`
    - `TOTAL_JOB_SLOTS`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deployments`
    - `apps/events/refresh`
    - `apps/events/sources/coworkmeet`
    - `apps/events/sources/dmda`
    - `apps/events/sources/salsanueva`
    - `apps/events/sources/url-extract`
    - `apps/mail/sync`
    - `apps/pages/content-search`
    - `apps/pages/history`
    - `apps/prototypes/thumbnails`
    - `apps/sonata/sources/midi/folders`
    - `apps/story/generation`
    - `apps/workflows/engine`
    - `backup`
    - `build`
    - `conversations`
    - `conversations/conversation-category`
    - `conversations/conversation-preprompt`
    - `conversations/conversation-progress`
    - `conversations/conversation-view/push-and-exit`
    - `conversations/conversation-view/turn-summary`
    - `conversations/conversations-view/queue`
    - `conversations/hibernation`
    - `conversations/transcript-retention`
    - `database/db-test-fixture/worktree-db`
    - `database/fork`
    - `database/live-state-snapshot`
    - `database/zero/cache-service`
    - `debug/boot-budget`
    - `debug/boot-monitor`
    - `debug/boot-watchdog`
    - `debug/live-state-churn/monitor`
    - `debug/op-rate`
    - `debug/queue-health`
    - `debug/read-set-shrink`
    - `debug/session-divergence`
    - `debug/slow-ops`
    - `debug/worktree-cleanup`
    - `improve`
    - `infra/attachments`
    - `infra/events`
    - `infra/events-test`
    - `infra/jobs/deadline-audit`
    - `infra/jobs/supervised-job`
    - `infra/retention`
    - `page/attachment-block`
    - `page/inline-date`
    - `page/links`
    - `shell/notifications`
    - `stats/cost`
    - `tasks/auto-start`
    - `tasks/task-title`
- Sub-plugins:
  - **`deadline-audit`** — Job deadline audit: registers a handler on the jobs plugin's deadline seam and turns each announcement into a report — job-deadline-exceeded (warning) when a run passes its hold class's wall-clock deadline and has ctx.signal aborted, job-zombie (error) when it is still holding its slot a grace period later, and job-slot-floor (error) when the written-off slots add up to a runner that can no longer do its job.
  - **`supervised-job`** — Out-of-process work as an ordinary job: defineSupervisedJob composes defineJob + a supervised-run kind into a handler that claims, spawns detached and SUSPENDS — so no worker slot is held while the child runs — then wakes on the supervisedRun.ended event, re-reads the child's exit marker (the authority; the event is only a wake-up) and records the outcome, surviving any number of backend restarts in between.
  - **`supervised-run`** — Long-running out-of-process work that survives a backend restart: a detached child whose merged output goes to a transcript FILE (published live by tailing it, so there is no pipe-shaped path to lose), a POSIX shim that records any command's exit status into an atomic marker, and ONE boot reconciler over every registered kind that closes the dead and re-attaches the living.
  - **`supervised-task`** — An out-of-process body that is not a command line: defineSupervisedTask registers an ordinary async function under an id, and `./singularity supervised-exec <id> <payloadJson>` boots the plugin graph in exec mode and runs it — so work assembled from contributions (backup's sources and targets) can be supervised as a detached child exactly like a CLI verb.

<!-- AUTOGENERATED:END -->
