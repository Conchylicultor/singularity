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
  - DB schema: `plugins/infra/plugins/jobs/server/internal/tables.ts`
  - Exports (types):
    - `BacklogJobStat`
    - `DeadJobStat`
    - `DefineJobSpec`
    - `DurableHooks`
    - `EnqueueOpts`
    - `EnqueueTx`
    - `JobCtx`
    - `JobFactory`
    - `QueueBacklogStat`
    - `RegisteredJob`
    - `RunningJobStat`
    - `ScheduleSpec`
    - `SerialSpec`
  - Exports (values):
    - `abortDurableRun`
    - `deadJobsResource`
    - `DEFAULT_MAX_ATTEMPTS`
    - `defineJob`
    - `getAllRegisteredJobNames`
    - `getJobSlowThresholdMs`
    - `isSuspendSignal`
    - `JOB_CONCURRENCY`
    - `jobsListResource`
    - `NonRetryableError`
    - `queryBacklogByJobName`
    - `queryDeadJobStats`
    - `queryQueueBacklog`
    - `queryRunningJobs`
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
    - `JobRow`
    - `JobsPayload`
    - `JobState`
  - Exports (values):
    - `cancelJob`
    - `DeadJobRowSchema`
    - `DeadJobsPayloadSchema`
    - `deadJobsResource`
    - `JobRowSchema`
    - `jobsListResource`
    - `JobsPayloadSchema`
    - `JobStateSchema`
    - `listDeadJobs`
    - `listJobs`
    - `retryJob`
- Cross-plugin:
  - Imported by:
    - `apps/events/refresh`
    - `apps/events/sources/dmda`
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
    - `tasks`
    - `tasks/task-title`

<!-- AUTOGENERATED:END -->
