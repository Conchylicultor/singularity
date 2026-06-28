# Performance investigations

Living index of the performance work. **We keep fixing the wrong path** — so the
rule here is: *measure and confirm the root cause without doubt before changing any
code.* Each session re-validates the prior session's conclusion against fresh data
rather than inheriting it.

## Goal

**Make the app feel instant: any page loads in < 1 s, including cold start.**

## Method (non-negotiable)

1. Reproduce and quantify with the `benchmark_boot` MCP tool **and** the live
   `get_runtime_profile` (aggregate `waits`, not just `avgMs`).
2. Separate **work** from **wait** — a high `avgMs` with a high wait / low `workMs`
   is queueing, not a slow op. Find the *dominant* wait layer before theorizing.
3. Only after the root cause is confirmed beyond doubt, write a fix plan.

## Sessions

- **2026-06-28 — [boot & git-loader slowness assessment](./2026-06-28-boot-and-git-loader-slowness-assessment.md).**
  First pass. Concluded the bottleneck is server-side *work + contention*, not
  client↔DB transport, so adopting Rocicorp Zero would not help. Named three root
  causes: (A) git-derived loaders (`edited-files`, `commits-graph`) on the
  first-subscribe critical path under the host heavy-read gate, (B) event-loop /
  heavy-read-pool starvation, (C) `live_state_snapshot` table bloat. Created tasks to
  benchmark and fix each. *Superseded in part by 2026-06-29: (A) turned out to be a
  symptom, and (B) is specifically DB-connection-pool exhaustion.*

- **2026-06-29 — [DB-pool exhaustion vs git loaders (root-cause hunt)](./2026-06-29-db-pool-exhaustion-flush-cascade-findings.md).**
  Re-measured (A) before building the planned fix. In isolation the git loaders are
  16–315 ms, not 7 s; under a fully-saturated host heavy-read gate they only reach
  172–448 ms. The live profile shows the real bottleneck: across all loaders,
  **DB-connection-pool wait (`loader-acquire`) = 243,614 ms** vs **host heavy-read
  gate (`heavy-read-acquire`) = 17 ms**. `flushNotifies` (the live-state cascade)
  maxes at **97 s** and owns 43,721 of 95,465 pool acquires. The git loaders are
  *victims* of pool exhaustion, not a cause. The planned git fix would have optimized
  a 17 ms path. **Root cause not yet confirmed beyond doubt — see that doc's open
  questions.**

## Causes — checklist

Legend: ✅ confirmed with data · ❌ discarded (with reason) · 🔬 open / needs proof

### Discarded
- ❌ **Client↔DB transport latency / adopt a sync engine (Zero)** — 2026-06-28: the
  dominant cost is server-side work+contention; git/fs-derived resources can't live
  in a Postgres replica anyway. Keep Zero only for future multi-device/offline sync.
- ❌ **Git loaders' work is slow** — 2026-06-29: `edited-files` work = 16 ms
  (prod, memo-warm), `commits-graph.delta` work ≈ 31 ms. Not the problem.
- ❌ **Host-wide heavy-read gate (`withHeavyReadSlot`, size 4) is the contention** —
  2026-06-29: `heavy-read-acquire` = **17 ms total** across all loaders. Negligible.
  *The original git-off-critical-path plan targeted only this — hence "wrong path".*

### Confirmed (symptoms, in impact order)
- ✅ **DB-connection-pool exhaustion** — `loader-acquire` = **243,614 ms** total;
  pool `[acquire]` max **44.6 s** over 95,465 acquires; many unrelated loaders all
  max at the same ~14,404 ms instant (one shared starvation event).
- ✅ **Live-state flush cascade (`flushNotifies`)** drives the pool demand —
  max **97.2 s**, 1,621 cycles, **43,721** pool acquires parented to it.
- ✅ **Slow connection-holders feed the loop** — `update conversations … last_viewed_at`
  max 48.8 s, `select … attempts_v` max 47.5 s, `live_state_snapshot` UPSERT max 50.5 s.

### Open — must be proven before any fix
- 🔬 **What TRIGGERS the flush storms?** cold-boot fan-out (16 backends) vs live-state
  churn (no-op pushes) vs the change-feed (STATEMENT triggers `pg_notify` per commit).
  Unproven.
- 🔬 **DB pool topology + size.** Is the embedded Postgres pool effectively shared
  host-wide across all worktree backends (so one busy worktree starves all)? What are
  the pgbouncer / `max_connections` limits? Unmeasured.
- 🔬 **Is `live_state_snapshot` bloat (188 MB / 20 rows) causal** for the slow
  snapshot writes that hold connections, or just correlated? Unproven.
- 🔬 **Per-worktree local heavy-read gate (size 2)** = 21,858 ms — real but 2nd-order;
  revisit only after the pool root cause is fixed.
- 🔬 **True cold-boot** path (server-boot work: catch-up, derived-table rebuild, pool
  warm) is *excluded* by `benchmark_boot`; the headline 7 s came from a real cold
  boot, so this window is still unmeasured.
