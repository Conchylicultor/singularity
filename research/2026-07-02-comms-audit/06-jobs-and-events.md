# 06 — Background Lane: Jobs, Events, Watchers

> Part of the [communications audit](./00-overview.md). Server↔server
> communication across *time*: durable background work, typed event→job
> bindings, and the push-based watchers that replace polling.

## 1. Jobs (`infra/jobs`) — durable work on graphile-worker

**Why a queue at all**: anything async that matters (fork a DB, sync a
mailbox, snapshot a page) must survive a backend restart mid-flight. A
graphile-worker row in Postgres is the durability primitive; the fork job
re-running after a crash instead of leaving a half-created DB is the
canonical payoff.

```ts
export const databaseForkJob = defineJob({
  name: "database.fork",
  input: z.object({ source: z.string(), target: z.string() }),
  event: z.never(),                       // not event-driven
  dedup: { key: (i) => i.target },        // one pending fork per target
  maxAttempts: 5,
  run: async ({ input, ctx }) => { await forkDatabase(input.source, input.target); },
});
await databaseForkJob.enqueue({ source: "singularity", target: attemptId });
```

Mechanics worth knowing:

- **One graphile task for everything** (`"jobs.run"`); the real job name
  travels in the payload — new `defineJob`s need no worker registration.
- **Dedup**: `"singleton"` (one pending per job), `{key}` (one per key —
  re-enqueueing with a new `runAt` *replaces* the pending row, which is how
  the pages-history pipeline collapses an edit burst into one snapshot),
  `"none"`.
- **Transactional enqueue**: `enqueue(input, { tx })` inserts the job on the
  caller's connection — rollback drops the job with the data.
- **Concurrency**: 4 shared slots per backend (`JOB_CONCURRENCY`) — the
  number queue-health's slot-hog detector watches.
- **Retry**: `maxAttempts` default 5; `NonRetryableError` collapses the
  budget (`max_attempts = attempts`) so deterministic failures dead-letter
  after one attempt instead of retry-storming — still loud, just not wasteful.
- **Dead letters**: graphile never GCs exhausted rows, so `jobs.dead-gc`
  (hourly, per-worktree) archives them into `dead_jobs` (30-day/2000-row
  bounded) and deletes the queue rows. Retry/delete via `/api/jobs/*` +
  the Debug → Queue pane.
- **Cron**: `schedule: { cron, perWorktree? }` — **main-only by default**
  (graphile's cron dedup is per-database and every worktree has its own DB
  fork, so an unqualified schedule would run N× machine-wide).
  `perWorktree: true` is for jobs acting on their own worktree's state
  (dead-gc, temp sweeps, queue-health sampling). `backfillPeriod: 0` — no
  missed-tick floods on boot.
- **Durable workflows**: `ctx.step(name, fn)` memoizes side effects per run
  (`_jobSteps`), `ctx.waitFor(event, {timeoutMs})` / `ctx.sleep(ms)` suspend
  via a sentinel throw (graphile row completes; a fresh `jobs.resume` enqueue
  continues when the event fires) — long waits hold no worker slot. Waits
  are bounded by default (7d, capped 1y; `unbounded: true` is the greppable
  escape hatch).
- **Auto-observability**: the worker wraps every run in a `job` profiler
  span; slow runs cross the slow-op pipeline into a deduped filed task with
  zero per-job instrumentation (`slowThresholdMs` per job to opt long syncs
  out).

## 2. Events (`infra/events`) — typed event→job bindings

The decoupling layer: the *announcer* of a fact and the *reactors* to it
never import each other.

```ts
// Owner declares the event with typed filter columns:
export const { event: refAdvanced } = defineTriggerEvent<RefAdvancedPayload>({
  name: "git.refAdvanced",
  filters: { refName: text("ref_name") },
});
await refAdvanced.emit({ refName, sha, previousSha });   // owner-only

// A subscriber binds a job — statically (permanent, code-declared):
contributions: [Trigger({ on: conversationCreated, do: titleJob, with: {}, oneShot: false })]
// …or dynamically (one-shot, e.g. under ctx.waitFor):
await trigger({ on: refAdvanced.where({ refName: "main" }), do: rebuildJob, oneShot: true });
```

How it works: each event gets a real DB table
(`<event>_triggers`, one column per filter, NULL = wildcard) that
participates in normal migrations — deleting the event's source file
generates the DROP. `emit()`:

1. SELECTs matching enabled trigger rows,
2. records the emission into a capped ring buffer `_event_emissions`
   (**always, even with 0 matches** — "why didn't my trigger fire" is the
   main debugging case),
3. enqueues one `events.dispatch` job per match (durable; `{tx}` threads the
   caller's transaction through all three writes).

`emit()` resolves when dispatch jobs are *durable*, not when handlers finish
— fire-and-continue at the durability boundary.

Self-healing (both documented): a boot sweep deletes trigger rows pointing at
jobs no longer registered; the dispatcher deletes a single dangling row on
resolution failure. Schema drift (job exists, payload no longer parses) is
deliberately *not* self-healed — it dead-letters loudly via
`NonRetryableError`. Static `Trigger()` contributions are wipe-and-reinsert
on every boot — the DB rows for declared bindings are a pure projection of
code, no drift possible.

## 3. Watchers — push-based change detection for non-DB sources

The "no polling" rule's positive half: every non-DB source gets an OS-level
watch primitive.

- **`infra/file-watcher`**: the shared `@parcel/watcher` wrapper —
  `createFileWatcher({ dirs, onChange, debounceMs=100, ceilingMs=1000,
  reconcileMs=30_000 })`. Debounce+ceiling batching (continuous churn still
  flushes); the reconcile timer is the one sanctioned periodic tick in the
  watcher stack — a *safety net* re-scan, not primary detection. Loaded
  lazily (the native addon breaks `bun --compile` if imported top-level;
  raw `@parcel/watcher` imports are banned by the watcher-safety lint).
  Consumers: git-watcher, config_v2, transcript-watcher, prototypes, sonata
  midi folders, plugin-tree, conversation op-status.
- **`infra/git-watcher`**: watches `${gitCommonDir}/refs` only (the whole
  common dir churns with every objects write across 1000+ worktrees) for
  `refs/heads/main` + the worktree's own branch. On sha change:
  `refHeadResource.notify()` (push resource, 300ms debounce absorbs rebases)
  always; `refAdvanced.emit()` main-only. The reconcile tick catches
  packed-refs movement the file watch can't see.
- **DB change detection is the change-feed** — see
  [02-database-layer](./02-database-layer.md) §5; it's the same philosophy
  applied to Postgres (triggers = the OS-level watch of the database).

## 4. Queue health (`debug/queue-health`) — monitoring the monitor

A 5-minute per-worktree job samples the queue **only through jobs' read-only
introspection API** (the graphile-internals coupling lives in one file) and
files deduped reports (→ tasks) for three failure smells:

- `queue-dead-job` — dead letters, one report per job name (a retry storm of
  one broken job = one task);
- `queue-backlog` — depth or oldest-overdue threshold, with a `STALLED`
  escalation when `lockedCount === 0` (worker making zero progress);
- `queue-slot-hog` — a job holding one of the 4 slots too long (starvation
  invisible to the backlog signal).

Thresholds are live config; `GET /api/debug/queue-health/summary` + the
`get_queue_health` MCP tool (which fetches *through the gateway* so an agent
can inspect any worktree's queue, not its own process's) expose the same data.

## 5. Real consumers (the patterns in the wild)

| Consumer | Pattern demonstrated |
|---|---|
| **mail sync tick** (`apps/mail/sync`) | The documented no-polling *exception*: Gmail's delta API has no reachable push channel (needs public inbound HTTPS), so a main-only cron job pulls `history.list` every minute — durable, observable, restart-safe; per-account try/catch so one bad account can't dead-letter the tick. Manual kick endpoint enqueues the same job. |
| **task-title generation** (`tasks/task-title`) | Static `Trigger` bindings on `conversation.created` / `userTurnSent` → thin dispatcher jobs → fire-and-forget Haiku CLI call, so creating a conversation never blocks on an LLM round-trip. |
| **pages history** (`apps/pages/history`) | Two-job debounce: an event-bound scheduler job re-enqueues a *keyed* snapshot job with `runAt = now+4s`; keyed dedup replaces the pending row per edit → one snapshot ~4s after the last keystroke. (Two jobs because the events dispatcher can't set `runAt`.) |
| **db fork** (`database/fork`) | Durable job + idempotent body + atomic publish + orphan sweep ([02](./02-database-layer.md) §4). |
| **conversations lifecycle** | `conversation.created` / `turn-completed` / `userTurnSent` trigger events fan out to title, category, summary, progress, auto-launch subscribers — none of which conversations imports. |
