# Root-cause hunt: the git loaders are victims; DB-pool exhaustion + the live-state flush cascade are the bottleneck

**Date:** 2026-06-29
**Status:** findings only — **root cause NOT yet confirmed beyond doubt.** No code
changes. See "Open questions" before planning any fix.
**Trigger:** the task "edited-files / commits-graph loaders take ~7s on first-subscribe"
asked to move git work off the critical path. Before building that, I re-measured —
because the 2026-06-28 assessment's numbers came from a single live-profile window and
some didn't add up (16 worktrees × 1 compute ÷ 4 host slots ≈ 1.2 s, not 4.7 s).

## TL;DR

The git loaders are **not** the cause. In isolation they're 16–315 ms; even with the
host heavy-read gate fully saturated they reach only 172–448 ms. The live profile of
main shows the real bottleneck is the **DB connection pool**: across all live-state
loaders, `loader-acquire` (DB-connection wait) totals **243,614 ms** while the
host-wide git gate (`heavy-read-acquire`) totals **17 ms**. The demand comes from the
**live-state flush cascade** (`flushNotifies`, max **97 s**, owns 43,721 of 95,465 pool
acquires). The original git-off-critical-path plan would have optimized a 17 ms path.

## Method

- `benchmark_boot` against `singularity` (main), warm mode (no DB mutation; the git
  first-subscribes are cold every iteration because the cycle evicts on teardown),
  6 iterations + 2 warmup, twice: isolated (`loadConcurrency 0`) and host-gate-saturated
  (`loadConcurrency 8` on a 4-slot gate).
- `get_runtime_profile` on `singularity`, kind `all` — the accumulated live window
  (95k+ DB acquires, so this reflects real production usage, not a synthetic burst).
- Aggregate-level `waits` extracted with `jq` (work-vs-wait per layer).

## Evidence

### A. The git loaders are fast (benchmark)

| first-subscribe | isolated | host-gate saturated (load=8) |
|---|---|---|
| `edited-files` | 315 ms | 448 ms (~140 ms gate wait) |
| `commits-graph.delta` | 34 ms | 172 ms (work 31 ms + `heavy-read-acquire` 142 ms) |
| `commits-graph.graph` | 34 ms | 32 ms |
| event-loop max lag | 13 ms | 9 ms |

Saturating the host gate adds only ~140 ms. To reach 7 s you'd need ~40× this
contention. The event loop is **not** starved by the gate. *Caveat:* the load
generator holds slots without burning CPU, so it can't reproduce 16 backends doing
real git subprocess work — but the live profile below makes that moot.

### B. The real bottleneck (live `get_runtime_profile`, main)

Summed `waits` across **all** live-state loaders:

| wait layer | total | meaning |
|---|---|---|
| **`loader-acquire`** | **243,614 ms** | waiting for a DB connection-pool slot |
| `heavy-read-local` | 21,858 ms | per-worktree git gate (size 2) |
| **`heavy-read-acquire`** | **17 ms** | host-wide git gate — *the plan's only target* |

The DB pool dominates the host git gate by ~14,000×.

### C. The flush cascade drives pool demand

- `flushNotifies`: **max 97,239 ms**, avg 440 ms, 1,621 cycles.
- DB pool `[acquire]`: 95,465 total, **max 44,579 ms**; **43,721** of them parented to
  `flushNotifies`.
- During a starvation event, many unrelated loaders max at the **same ~14,404 ms**
  (`attempts`, `tasks`, `conversations-active/system/gone`, `notifications`,
  `build.history`) — one shared pool-exhaustion stall, not per-resource slowness.

### D. Slow connection-holders feed the loop

- `update conversations … last_viewed_at`: max **48,775 ms** (avg 9,451 ms, x10)
- `select … from attempts_v where id`: max **47,524 ms** (avg 1,330 ms)
- `live_state_snapshot` UPSERT: max **50,523 ms**
- `live_state_snapshot` table bloat: **188 MB for 20 live rows** (94 MB after
  autovacuum ran during my session).

### E. The git loaders are victims

- `edited-files` (live): **avg 28 ms, work 16 ms** over 3,667 calls; its 27 s max is
  46,155 ms of `loader-acquire` (DB pool), not git. (The benchmark's 315 ms is a cold
  memo miss; in prod the @parcel watcher keeps the memo warm → 16 ms read.)
- `commits-graph.delta` (live): avg 2,704 ms, with `loader-acquire` 27,425 ms +
  `heavy-read-local` 21,858 ms + `heavy-read-acquire` **17 ms**. Its 53 s max is
  DB-pool + local-gate wait, not git work.

## Conclusion (what is proven)

1. The host heavy-read gate is **not** a meaningful bottleneck (17 ms). The
   git-off-critical-path / bound-host-concurrency plan is the **wrong path** and is
   shelved.
2. The dominant wait is **DB connection-pool exhaustion** (`loader-acquire`
   243,614 ms; `[acquire]` max 44.6 s).
3. The pool demand is driven by the **live-state flush cascade** (`flushNotifies`
   max 97 s, 43,721 acquires) and worsened by **slow connection-holders** (bloated
   `live_state_snapshot` writes, multi-second `update conversations`/`attempts_v`).
4. The git loaders are downstream victims of 2–3.

## Open questions — must be answered before ANY fix

We keep fixing symptoms. Do **not** plan a fix until each is answered with data:

1. **What triggers the flush storms?** Instrument/attribute `flushNotifies`: cold-boot
   fan-out (many backends) vs live-state churn (no-op/empty-diff pushes — the
   `live-state-churn` monitor already exists) vs the change-feed (STATEMENT triggers
   `pg_notify` on every commit). Need the distribution of *what enqueues* the 1,621
   flushes and why one runs 97 s.
2. **DB pool topology + limits.** Is the embedded-Postgres pool effectively shared
   host-wide across all worktree backends via pgbouncer (so one busy worktree starves
   all)? Exact pool size, `max_connections`, and pgbouncer mode. Is `loader-acquire`
   contending *within* a backend or *across* backends?
3. **Is the `live_state_snapshot` bloat causal?** Confirm the slow snapshot UPSERTs
   (max 50 s) are holding pool connections during flushes (vs merely correlated).
   Measure write latency vs bloat before/after a `VACUUM FULL`.
4. **Why do simple indexed queries take 47 s?** `select … attempts_v where id` and
   `update conversations` should be sub-ms — confirm they are *waiting* (pool/lock),
   not executing, and identify the lock/queue.
5. **True cold-boot.** `benchmark_boot` excludes server-boot work (catch-up,
   derived-table rebuild, pool warm) — the original 7 s came from real cold boot.
   Capture a real cold-boot profile (fresh backend) + the browser boot-trace.

## Suggested next step (diagnosis, not fix)

Profile `flushNotifies` end to end: what enqueues each flush, how many resources/pks a
cycle recomputes, how many DB connections it holds and for how long, and correlate the
97 s outlier with pool `[acquire]` depth and the snapshot-write latency at that moment.
That single trace should confirm (or refute) the flush-cascade → pool-exhaustion chain
beyond doubt.

## Raw data

Live profile saved at (this session):
`…/tool-results/mcp-singularity-get_runtime_profile-1782686727529.txt`
(`jq '.kinds.loader.aggregates[] | select(.label=="commits-graph.delta")'` etc.).
