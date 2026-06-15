# Relieving shared-Postgres contention from the live-state cascade

## Context

A slow-op flagged a 5.5s `tasks_v` read, but that was a symptom. On the main DB the
dominant signal is **connection-pool acquisition stalls** (`db [acquire]`: ~836 waits,
~1037s total, max 10.8s), with many unrelated loaders (`conversations_v`, `tasks_v`,
`attempts_v`, `pushes`, `notifications`, `queue_state`) all spiking to ~6–7s at the
*same instants* — a thundering-herd storm, not one slow query.

Root cause is structural: **every git worktree runs a full live-state stack against one
shared embedded Postgres**, and the live-state cascade fans one change out to ~10
dependent loader queries per worktree, all fired in a single microtask flush. When the
signal is shared across worktrees (a `refs/heads/main` advance), every worktree reacts
simultaneously. ~71 active Postgres backends on an 18-core box means each query also
competes for CPU, so queries run slower, hold their pool slot longer, and saturate the
pool → acquire stalls → feedback loop.

**Constraints (given):**
- Per-worktree node-postgres pool `max: 16` is deliberate (5 caused cold-start
  queueing). Pool *size* is **not** the knob.
- The `tasks_v` / `attempts_v` view rewrite already landed (~40× less work per cascade
  query); that is not re-planned here.
- Prefer clean primitives over point patches.

**Key reframe from exploration:** the "long-holding endpoints" (`GET /api/stats/cost/*`
~35s, `GET /api/review/plugin-changes` ~19s, the `edited-files` loader ~17s) do **not**
hold a DB connection for their duration. Each runs one fast indexed `SELECT` (released
immediately by the patched `pool.query` in
`plugins/database/server/internal/client.ts`) and then spends all remaining time in git
subprocesses / JSONL filesystem reads. They don't occupy pool slots — but they burn
CPU/IO on the same oversubscribed box, stealing cores from Postgres backends and
*indirectly* lengthening every query. So "move them off the hot pool" becomes "stop them
from spawning N simultaneous CPU-heavy jobs."

**Intended outcome:** a burst of notifies (poller ticks, mutation storms, git ref
advances) collapses into far fewer flushes; concurrent loaders and CPU-heavy endpoints
are bounded so no single storm can saturate all cores at once. Acquire-stall max and the
count of slow acquires drop sharply, with no user-visible latency regression.

---

## The two independent levers

1. **Collapse the fan-out in time** — fewer flushes (debounce at the notify scheduler)
   and fewer edges per flush (drop the dead FULL-recompute edge).
2. **Bound concurrency** — even a storm that does fire can't put 71 backends + N git/fs
   subprocesses on 18 cores at once (loader semaphore + per-route endpoint limit/dedup).

All changes sit at seams already designed as composition points (`scheduleNotify`,
`dependsOn`, `wrapLoad`, `recordEntrySpan`), so each is an option/abstraction, not a
patch.

---

## End state (full design)

### Change 1 — `debounceMs` option on the cascade scheduler  *(the core primitive)*

**File:** `plugins/framework/plugins/resource-runtime/core/runtime.ts`
**Symbols:** `ResourceDefinition` (add `debounceMs?: number`), `RegistryEntry` (add a
per-entry `debounceTimer`), `scheduleNotify` (line 465), `flushNotifies`.

Today `scheduleNotify` merges into `entry.pendingNotifies` via `mergePending` (which
already coalesces per `(key, paramsKey)` and stickily absorbs FULL), then schedules a
single global flush via `queueMicrotask` guarded by `flushScheduled`. Resources with no
`debounceMs` keep this exact behavior.

When an entry declares `debounceMs`, `scheduleNotify` does **not** ride the immediate
microtask flush; it (re)arms a per-entry `setTimeout(debounceMs)` that fires
`flushNotifies()`. The merge into `pendingNotifies` is unchanged, so all FULL-absorbing /
scoped-union coalescing keeps working — the debounce only delays *when* the accumulated
pending map drains. Two important properties:

- **Piggyback:** if any *other* (non-debounced) resource triggers a flush during the
  window, `flushNotifies` drains *all* pending including the debounced entry's and clears
  its timer — so debounced data never adds latency beyond an already-happening flush.
- **Max-wait safety:** the per-entry timer is *not* reset to the full window on every
  notify under sustained load (cap the re-arm so a continuously-ticking source still
  flushes at least every `debounceMs`), preventing starvation.

`withNotifyBatch` already short-circuits (`batchDepth > 0` returns before scheduling), so
it composes unchanged.

**Why a primitive:** `scheduleNotify` is the single chokepoint every `notify()` and every
cascade `mergePending` flows through. One declarative field lets any resource opt in, and
it composes with `withNotifyBatch` + downstream cascade coalescing automatically.
Debouncing inside each caller (poller, watcher) instead would scatter timer state across
plugins and would *not* coalesce cross-source bursts hitting the same resource.

**Coupling — optimistic-mutation / keyed delta-sync:** keyed resources (`attempts`,
`tasks`) drive client optimistic reconciliation. **Do not** put `debounceMs` on
`attemptsResource`/`tasksResource` — debounce the *source* (`conversationsLiveResource`)
and let the cascade stay synchronous within each drain, so the keyed snapshot diff never
sees a torn intermediate state. A user's own mutation typically notifies directly (queue
handler / `tasksResource`), so the source-debounce does not delay confirmation of an
interactive edit.

### Change 2 — Adopt `debounceMs` on the two highest-fan-out sources

- **`plugins/tasks/plugins/tasks-core/server/internal/resources.ts:29`** —
  `conversationsLiveResource`, `debounceMs: ~250`. The dominant per-worktree storm: one
  notify → `attempts` → `tasks` + the two FULL recomputes (`queueRanks`,
  `agentLaunches`). The poller (`plugins/conversations/server/internal/poller.ts`,
  `TICK_MS = 1000`) can call `notifyConversationsChanged` multiple times per tick;
  debounce collapses a tick's worth of status changes into one flush.
- **`plugins/infra/plugins/git-watcher/server/internal/ref-head-resource.ts:7`** —
  `refHeadResource`, `debounceMs: ~300`. A rebase rewrites `refs/heads/main` many times in
  quick succession; the watcher fires `notify({ refName })` per write, cascading to
  `mainAheadCount` (git rev-list) + `commitDelta`/`commitsGraph` per on-screen chip. This
  is the **cross-worktree** storm (one main advance → N worktrees × git subprocesses);
  debouncing each worktree's reaction is the biggest cross-worktree relief.

*(Optional supplement: wrap the poller `tick()` body in `withNotifyBatch` so the adoption
FULL notify and the scoped `changedIds` notify coalesce into one pending map before the
window even arms. Strictly secondary to the source-debounce.)*

### Change 3 — Remove the dead `queueRanksResource → conversationsLiveResource` edge

**File:** `plugins/conversations/plugins/conversations-view/plugins/queue/server/internal/resource.ts`

`queueRanksResource`'s loader reads only `conversations_ext_queue` ranks + pin
validation — it does **not** read conversation *status*. A status change (the dominant
poller signal) changes no rank row, yet the `dependsOn: [conversationsLiveResource]` edge
forces a FULL recompute on every tick. **Verify** that every rank/pin/membership mutation
(`handle-reorder`, seed-rank job, validate-pin job) already notifies `queueRanksResource`
directly; if so, **drop the conversations edge** (pure waste). If a conversation going
`gone` must drop it from the queue view *only* via this cascade, keep the edge but add an
`affectedMap` returning `[]` unless the change is membership.

`agentLaunchesResource` (`plugins/conversations/plugins/agents/server/internal/resources.ts`)
genuinely depends on conversation status; it is push-mode so an `affectedMap` can only
*skip* (empty-set) when no changed conversation belongs to an agent-launch task. Narrower
benefit — lowest priority.

### Change 4 — Loader-concurrency semaphore at the `wrapLoad` seam

**File:** `plugins/framework/plugins/server-core/core/resources.ts:80`
**Symbol:** the `wrapLoad: (key, fn) => recordEntrySpan("loader", key, fn)` lambda.

Wrap in a per-worktree async semaphore:
`wrapLoad: (key, fn) => loaderSemaphore.run(() => recordEntrySpan("loader", key, fn))`,
cap ≈ 8–12 (below pool `max: 16`, leaving headroom for mutation/HTTP queries). The
semaphore is a small reusable primitive (counter + FIFO waiter queue) — add it under
`plugins/packages/` alongside `retry`, not inlined.

**Why this seam:** every cascade loader, sub-ack load, and HTTP-fallback load funnels
through `wrapLoad` (via `timedLoad`); wrapping *outside* `recordEntrySpan` keeps profiler
attribution intact. This bounds the herd at the exact moment ~10 loaders fire in one
flush — they queue at the semaphore instead of all hitting `pool.connect()` at once.
Central-core passes no `wrapLoad`, so central (no DB) is untouched. **Tune the cap** so
the boot warm-up burst isn't serialized into a cold-start regression.

### Change 5 — Per-route `concurrency` + `dedupe` on CPU-heavy endpoints

**File:** `plugins/infra/plugins/endpoints/core/implement.ts` (the returned handler,
around `recordEntrySpan("http", _endpoint.route, ...)`).

Extend `defineEndpoint` / `EndpointDef` with optional `concurrency?: number` and
`dedupe?: boolean`. `implement` honors them: a per-route semaphore gates the handler body;
`dedupe` collapses concurrent identical GETs (route + full query/params key) onto one
in-flight promise — generalizing the bespoke `inflight` pattern already hand-rolled in
`plugins/stats/plugins/cost/server/internal/load-usage.ts`.

Apply: `concurrency: 1–2` on `GET /api/review/plugin-changes`
(`plugins/review/plugins/plugin-changes/server/internal/handle-plugin-changes.ts`, which
spawns `git archive | tar`), and `dedupe` on the `edited-files` loader
(`plugins/conversations/plugins/conversation-view/plugins/code/server/internal/edited-files-resource.ts`).
The cost routes already cache+dedup at the data layer, so they opt out (or set a small
concurrency). **Restrict dedup to GET**; never dedup mutations. This removes the
CPU-theft half of the contention by stopping simultaneous git/tar/JSONL spawns.

---

## Leverage ranking (relief per unit risk)

1. **Change 2A** — `debounceMs` on `conversationsLiveResource` (via Change 1). Collapses
   the dominant per-worktree storm. Lowest risk, highest relief.
2. **Change 2B** — `debounceMs` on `refHeadResource`. Kills the cross-worktree rebase
   storm. Very low risk.
3. **Change 4** — loader semaphore. Caps each worktree's acquire-wait herd. Moderate risk
   (tune cap).
4. **Change 3** — remove the dead queue→conversations edge. Pure-waste removal, gated on
   verifying queue handlers self-notify.
5. **Change 5** — endpoint concurrency/dedup. Removes CPU theft; isolated surface.
6. **Change 3 (agentLaunches affectedMap skip)** — narrowest.

---

## Rollout

**Increment 1 (recommended to ship first):** Change 1 + Change 2A — add the `debounceMs`
primitive and adopt it on `conversationsLiveResource`. ~1 primitive + 1 line of adoption,
touches the single highest-fan-out path, fully reversible, no keyed delta-sync or
endpoint-contract changes. Measure, then layer in the rest.

**Follow-up tasks to file** (the remaining end state, to land after measuring increment 1):
- *Debounce `refHeadResource` to collapse the cross-worktree rebase storm* (Change 2B).
- *Loader-concurrency semaphore at `wrapLoad` (+ reusable semaphore primitive under
  `plugins/packages/`)* (Change 4).
- *Remove/skip the dead `queueRanksResource → conversationsLiveResource` edge* (Change 3),
  after verifying queue handlers self-notify.
- *Per-route `concurrency` + `dedupe` on the endpoints primitive; apply to
  `plugin-changes` and `edited-files`* (Change 5).

---

## Verification

**Baseline (before):**
- `mcp__singularity__get_runtime_profile` `kind:"db"` — record `[acquire]` aggregate (max
  ~10.8s, 836 waits) and the `byParent` breakdown attributing acquires to
  `conversations`/`attempts`/`tasks`/`queue-ranks`/`agent-launches` loaders. Also
  `kind:"loader"` and `kind:"http"` (plugin-changes / edited-files max).
- `mcp__singularity__query_db` (target `singularity` or a busy worktree):
  `SELECT datname, count(*) FROM pg_stat_activity GROUP BY 1 ORDER BY 2 DESC;` (the ~71
  backends and their distribution) and
  `SELECT wait_event_type, wait_event, count(*) FROM pg_stat_activity WHERE state='active' GROUP BY 1,2;`.

**After each increment:**
- `get_runtime_profile kind:"db"` — `[acquire]` max and slow-acquire count drop sharply;
  `byParent` for `conversations`/`attempts`/`tasks` shows *fewer invocations* (coalesced),
  not just faster ones.
- `get_runtime_profile kind:"loader"` — `conversations`/`refHead` loader *count* drops
  while average stays flat (no per-flush regression). For Change 4, confirm `loader`
  average does NOT climb (semaphore not over-serializing) while `[acquire]` max falls.
- **No-stale check:** trigger a single isolated status change → confirm it still lands
  promptly (piggyback/next flush); trigger a burst (advance main / mass status change) →
  confirm one flush, not ten.
- `query_db` `pg_stat_activity` rollup during a deliberate storm — simultaneous
  active-backend peak across worktrees drops, especially after Change 2B.
- For Change 5: `get_runtime_profile kind:"http"` — `plugin-changes`/`edited-files` max
  falls; under concurrent identical requests, dedup shows a single handler invocation.

## Critical files
- `plugins/framework/plugins/resource-runtime/core/runtime.ts` — `debounceMs` primitive
  (`ResourceDefinition`, `RegistryEntry`, `scheduleNotify`:465, `flushNotifies`).
- `plugins/tasks/plugins/tasks-core/server/internal/resources.ts:29` — adopt on
  `conversationsLiveResource`.
- `plugins/infra/plugins/git-watcher/server/internal/ref-head-resource.ts:7` — adopt on
  `refHeadResource`.
- `plugins/framework/plugins/server-core/core/resources.ts:80` — `wrapLoad` semaphore seam.
- `plugins/infra/plugins/endpoints/core/implement.ts` — per-route `concurrency`/`dedupe`.
- `plugins/conversations/plugins/conversations-view/plugins/queue/server/internal/resource.ts`
  — remove/skip the dead conversations edge.
