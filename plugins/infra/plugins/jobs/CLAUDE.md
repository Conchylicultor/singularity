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

There is one declaration and no second field. It picks the reservation tier
today; when `research/2026-08-17-global-bounded-job-execution.md` Phase 2 lands,
the same class ceiling becomes the deadline that aborts `ctx.signal`. A lane and
a budget cannot disagree if there is only one thing to declare.

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
reclassified or fixed (loud runtime), and Phase 2 later turns that same number
into an abort.

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
  - Uses:
    - `database.db`
    - `database/admin.connectionString`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `primitives/log-channels.Log`
  - DB schema: `plugins/infra/plugins/jobs/server/internal/tables.ts`
  - Exports (types):
    - `BacklogJobStat`
    - `DeadJobStat`
    - `DefineJobSpec`
    - `DurableHooks`
    - `EnqueueOpts`
    - `EnqueueTx`
    - `HoldClass`
    - `HoldClassSpec`
    - `JobCtx`
    - `JobFactory`
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
    - `DEFAULT_MAX_ATTEMPTS`
    - `defineJob`
    - `getAllRegisteredJobNames`
    - `getJobHold`
    - `getJobSlowThresholdMs`
    - `HOLD_CLASSES`
    - `HOLD_SPECS`
    - `HoldClassSchema`
    - `holdForTask`
    - `isSuspendSignal`
    - `jobsListResource`
    - `LEGACY_JOB_TASK`
    - `NonRetryableError`
    - `priorityFor`
    - `queryBacklogByJobName`
    - `queryDeadJobStats`
    - `queryQueueBacklog`
    - `queryRunningJobs`
    - `reachableSlots`
    - `RUNNERS`
    - `taskFor`
    - `TOTAL_JOB_SLOTS`
    - `UNSAFE_getRegisteredJob`
    - `UNSAFE_installDurableHooks`
    - `UNSAFE_sweepStuckLocks`
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
    - `apps/events/refresh`
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
    - `infra/retention`
    - `page/attachment-block`
    - `page/inline-date`
    - `page/links`
    - `shell/notifications`
    - `stats/cost`
    - `tasks/auto-start`
    - `tasks/task-title`

<!-- AUTOGENERATED:END -->
