# queue-health

The graphile-worker job queue degrades **silently** — nothing in the UI signals
when it breaks. This plugin makes its saturation/failure modes **loud** by filing
them into the existing reports engine (the same surface that captures crashes),
modeled byte-for-byte on `debug/slow-ops` (durable signal → `ReportKind` →
deduped report; investigation task on demand), and surfaces an attributed snapshot on demand via a summary
endpoint + the `get_queue_health` MCP tool. It reads the queue **read-only**
through the jobs plugin's public introspection API (`queryDeadJobStats` /
`queryQueueBacklog` / `queryBacklogByJobName` / `queryRunningJobs`), which owns
the graphile-internals coupling — the `jobs.run` task literal, the
`payload->>'jobName'` encoding, the ready/terminally-dead predicates — so this
monitor can never drift from how the queue is actually encoded.

## The monitor is an interval, not a job

`server/internal/watchdog.ts` is a raw `setInterval` (30s) on the backend's own
event loop, started from `onReady` and stopped in `onShutdown`. It used to be a
scheduled job — `debug.queue-health-monitor`, `{ cron: "*/5 * * * *",
perWorktree: true }` — and that is exactly why the 2026-08-17 incident was
found by hand. Main's queue wedged for 70 minutes with **eleven copies of this
monitor sitting in the frozen backlog it exists to report**. Both its
`queue-backlog` and `queue-slot-hog` conditions were satisfied; neither report
was ever filed, because the thing that files them was queued behind the wedge.

A monitor queued behind the failure it detects detects nothing. The doctrine was
already written down, in this repo, on the jobs plugin's `stuck-lock-sweeper.ts`:
*"Infra that recovers the job system must not depend on the job system."* This
file is the same rule applied to the alarm rather than the recovery, and it is
modeled on that sweeper byte for byte — module-level timer, `start`/`stop` pair,
`runTracked` wrapper, `.catch → console.warn`, plus an exported
`queueHealthTickOnce()` for forcing a tick.

**Cadence is a module constant (`TICK_MS = 30_000`), not config**, for the same
reason the sweeper's `SWEEP_INTERVAL_MS` is: it is a property of the detector,
not a threshold an operator tunes. 30s gives six samples per three-minute wedge
window, so one slow or skipped tick cannot false-negative. `queryDeadJobStats()`
runs only every 10th tick — a dead-letter stays dead, and that preserves the
5-minute cadence the old scheduled monitor gave it.

Known escalation, deliberately not built: the watchdog rides the same event loop
it watches, so a wedged **loop** silences it. That failure class belongs one
level lower — the sentinel's worker thread. A monitor runs exactly one level
below the subsystem it watches, and no lower.

### Why it lives here and not beside the sweeper in `jobs`

The plugin DAG forbids the other placement. `reports/server/internal/record-report.ts`
imports `recordNotification` from `shell/notifications`, whose barrel imports a
`defineJob` from `jobs` — so `jobs → reports → shell/notifications → jobs` is a
cycle, and `no cycles` is enforced by `./singularity check plugin-boundaries`.
This plugin already imports both `jobs` and `reports`, so the placement adds
**zero new plugin edges**, and it keeps queue *interpretation* (thresholds,
config, report kinds) out of the load-bearing mechanism-only `jobs` plugin.

## What it monitors

Each tick takes **one** `queryQueueBacklog()` and **one** `queryRunningJobs()`
and shares that snapshot across all three live checks — cheaper than the old
per-check queries, and load-bearing for the wedge test, which compares a
locked-id set against a locked count and would reset its own clock forever if
the two came from different snapshots. Reports fire only when a threshold trips:

- **`queue-wedged`** (variant `error`) — **the queue has stopped draining.** The
  other three say the queue is deep, or that something is slow; both are
  routinely true and benign (the nightly `backup.run` trips slot-hog every
  night). This one says the thing an operator must act on. It trips only when
  all four hold **continuously for `wedgeMinutes`** (default 3):
  1. every slot is held (`running.length >= JOB_CONCURRENCY`);
  2. the set of locked job ids is **unchanged across ticks** — the condition
     that separates "wedged" from "busy". A saturated pool that is completing
     work churns its ids every tick and never trips;
  3. `readyCount > 0` — work is actually being starved. Four long jobs with an
     empty queue behind them is a busy machine, not an outage;
  4. every holder is **`alive`** — a row whose owner *died* belongs to the
     stuck-lock sweeper, which reclaims it within a minute; reporting it here
     would double-report a condition already recovering itself.

  The only state this needs is one module-level `{ ids, since }` candidate,
  cleared the moment any condition stops holding. No new SQL — all four facts
  come from the existing introspection API. `heldForMs` is the **minimum**
  `lockedForMs` across holders (every slot has been held at least this long),
  read off graphile's `locked_at` rather than off our own observation window, so
  a backend booting into an already-wedged queue reports the true 14 minutes
  instead of the 3 it has been awake. **One rolling report per worktree**
  (fingerprint `queue-wedged`). No lane dimension yet — the queue is one shared
  pool today, and per-lane wedges arrive with the lane runtime.
- **`queue-dead-job`** (variant `error`) — terminally-failed jobs
  (`attempts >= max_attempts AND locked_at IS NULL`, the same predicate
  `reconcileDeadJobs` uses), grouped by `payload->>'jobName'`. **One report per
  distinct jobName** (fingerprint `queue-dead-job:<jobName>`), so a retry-storm of
  one broken job collapses to a single report while distinct broken jobs get
  distinct reports (investigation task on demand).
- **`queue-backlog`** (variant `warning`, escalates to STALLED) — depth/stall.
  Trips when `readyCount > backlogDepthThreshold` **or** the oldest ready job is
  overdue past `oldestOverdueMinutes`. `stalled = lockedCount === 0 && overdue`
  (the worker is making no progress). **One rolling report per worktree**
  (fingerprint `queue-backlog:rollup`; the reports unique index is
  `(fingerprint, worktree)`, so worktrees never collide). When a threshold trips
  the payload is **enriched** with `topReady` — a top-N per-jobName breakdown
  (`queryBacklogByJobName`) attributing which jobs are filling the ready queue.
  The extra query runs only on the already-tripped path, so the healthy path
  stays aggregate-only. `topReady` is **optional** so reports stored before this
  field existed still parse.
- **`queue-slot-hog`** (variant `warning`) — slot-hogging. The worker drains a
  single shared pool of `JOB_CONCURRENCY` slots; a job locked/running for many
  minutes starves the queue **even while `lockedCount > 0`** — the exact wedge
  the backlog `stalled` signal (which only trips at 0 locked) cannot see.
  `checkSlotHogs` calls `queryRunningJobs()`, collapses to the longest-held slot
  per jobName, and files one report per jobName whose `lockedForMs` exceeds
  `runningJobMinutes`. **One report per distinct jobName** (fingerprint
  `queue-slot-hog:<jobName>`).

## Summary endpoint + MCP tool

- **`GET /api/debug/queue-health/summary`** (`queueHealthSummaryEndpoint`) — a
  single attributed snapshot: `{ concurrency, backlog:{readyCount, lockedCount,
  oldestOverdueMs}, byJobName, running, dead }`, assembled from the jobs plugin's
  read-only introspection API.
- **`get_queue_health`** MCP tool — proxies to the summary endpoint through the
  gateway (the `get_runtime_profile` gateway-proxy pattern), so it always reads
  the target worktree's live backend. `worktree` arg (defaults to the
  conversation's own worktree; pass `"singularity"` for main). `byJobName`
  attributes the ready backlog, `running` (with `lockedForMs`) attributes who
  holds the shared slots, and `dead` the terminal failures.

## All four kinds are `duressExempt`

A queue in trouble and a host under duress are overwhelmingly the same event, so
without the flag `recordReport`'s shed gate buffers exactly the reports that
describe the outage — and can drop them on buffer overflow at peak. That was the
second, quieter silencer on 2026-08-17: even a monitor that ran would have had
its report swallowed. Same argument `duress-shed` and `duress-episode` make:
these reports ARE the durable record of the condition, so shedding them loses the
only evidence there was one.

## Thresholds (config_v2, mirroring slowOpConfig)

`enabled = true`, `backlogDepthThreshold = 200`, `oldestOverdueMinutes = 10`,
`runningJobMinutes = 5` (slot-hog), `wedgeMinutes = 3`. Read live each tick via
`getConfig`, editable in Settings → Config. The 30s tick interval is **not**
here — see above.

## Why per-backend and cheap

- **Per-backend** — every worktree backend runs its own graphile worker against
  its own DB fork, so dead/backlog state accumulates per-DB and must be sampled
  per-DB. As an interval this is automatic (each backend runs its own), where the
  scheduled job had to say `perWorktree: true`.
- **Aggregate queries, bounded row fetches** — the healthy path is one backlog
  aggregate + one bounded currently-locked scan (plus the dead-job aggregate
  every 10th tick); the per-jobName backlog breakdown fetches only on the
  already-tripped path. Negligible cost; reports fire only on a tripped threshold
  (silent when healthy), and the engine's velocity limiter + dedup absorb bursts.
  All four kinds set `notifCooldownMs ≈ 10 min` so a persistent problem re-alerts
  the bell periodically without spamming.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Queue-health report renderers: one-line Debug → Reports summaries for the queue-wedged, queue-dead-job, queue-backlog, and queue-slot-hog kinds, plus the threshold config registration. Queue-health watchdog: a 30s interval on the backend's own event loop — deliberately NOT a scheduled job, which would queue behind the wedge it exists to detect — that samples the graphile queue and files deduped reports for a wedged queue (every slot held by the same live jobs while ready work starves), backlog/stall, slot-hogging jobs, and terminally-dead jobs, through the existing reports engine. All four kinds are duressExempt. Also exposes a queue-health summary endpoint + the get_queue_health MCP tool.
- Web:
  - Contributes:
    - `ConfigV2.WebRegister` "queue-health"
    - `Reports.KindView` → `DeadJobSummary`
    - `Reports.KindView` → `BacklogSummary`
    - `Reports.KindView` → `SlotHogSummary`
    - `Reports.KindView` → `WedgedSummary`
  - Uses:
    - `config_v2.ConfigV2`
    - `primitives/css/badge.Badge`
    - `primitives/css/inline.Inline`
    - `reports.Reports`
- Server:
  - Contributes:
    - `ConfigV2.Register` "queue-health"
    - `report-kind` "queue-dead-job"
    - `report-kind` "queue-backlog"
    - `report-kind` "queue-slot-hog"
    - `report-kind` "queue-wedged"
  - Uses:
    - `config_v2.ConfigV2`
    - `config_v2.getConfig`
    - `infra/endpoints.implement`
    - `infra/jobs.JOB_CONCURRENCY`
    - `infra/jobs.queryBacklogByJobName`
    - `infra/jobs.queryDeadJobStats`
    - `infra/jobs.queryQueueBacklog`
    - `infra/jobs.queryRunningJobs`
    - `infra/jobs.QueueBacklogStat`
    - `infra/jobs.RunningJobStat`
    - `infra/mcp.Mcp`
    - `reports.recordReport`
    - `reports.ReportKind`
    - `tasks/tasks-core.getConversation`
  - Exports (values): `queueHealthTickOnce`
  - Register: `mcpTool('get_queue_health')`
  - Routes: `GET /api/debug/queue-health/summary`
- Core:
  - Uses:
    - `config_v2.defineConfig`
    - `fields/bool/config.boolField`
    - `fields/int/config.intField`
    - `infra/endpoints.defineEndpoint`
  - Exports (types):
    - `QueueBacklogPayload`
    - `QueueDeadJobPayload`
    - `QueueHealthSummary`
    - `QueueSlotHogPayload`
    - `QueueWedgedPayload`
  - Exports (values):
    - `QueueBacklogPayloadSchema`
    - `QueueDeadJobPayloadSchema`
    - `queueHealthConfig`
    - `queueHealthSummaryEndpoint`
    - `QueueHealthSummarySchema`
    - `QueueSlotHogPayloadSchema`
    - `QueueWedgedPayloadSchema`

<!-- AUTOGENERATED:END -->
