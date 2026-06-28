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
  questions.** *Superseded by the next session: pool exhaustion is a downstream,
  intermittent symptom, not the driver.*

- **2026-06-29 (2) — [notifications unbounded resource = the driver (root cause confirmed)](./2026-06-29-notifications-unbounded-resource-root-cause.md).**
  Answered all five open questions with converging profile + DB + code evidence.
  The driver is a handful of **oversized monolithic `push` live-state resources** that
  load an entire unbounded table as one blob and re-serialize/re-snapshot/re-deliver the
  *whole* blob on every change — worst by 4× is **`notifications`: 1.88 MB, 21,803
  undismissed rows, loaded with no `LIMIT`**. Its full-blob UPSERT bloated
  `live_state_snapshot` TOAST to **112 MB** (4.95 s writes) and its delivery is the
  slowest push (5.9 s). The blob grows forever because the **reports system files a
  notification per report (~281/h)** and the TTL sweep never auto-dismisses
  `warning`/`error` variants. Re-validated the prior session: this window's `[acquire]`
  max is **81 ms**, not 44.6 s — pool exhaustion spikes only *during* these big-blob
  storms (cold-boot fan-out + notifications churn), so it is a symptom. "Simple queries
  take seconds" = pure wait (an 88 kB / 20-row table can't scan for 3 s). **Root cause
  confirmed beyond doubt; fix plan in the doc, pending user go-ahead.**

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

### Confirmed root cause (2026-06-29 session 2 — cause→effect ordered)
- ✅ **DRIVER: oversized monolithic `push` live-state resources** load an entire
  unbounded table as one blob and re-serialize + re-snapshot + re-deliver the *whole*
  blob on every change. Worst by 4×: **`notifications` = 1.88 MB / 21,803 undismissed
  rows, loaded with no `LIMIT`** (also `pushes` 437 kB, `attempts` 381 kB, `tasks`
  369 kB).
- ✅ **GROWTH: reports → notifications, no retention.** `recordReport` files a
  notification per report (~281/h); the TTL job auto-dismisses only `info`/`success`,
  never `warning`/`error` → 21,085 `report` rows accumulate since 2026-06-13. The
  monitoring infra feeds the problem.
- ✅ **EFFECT 1 — `live_state_snapshot` TOAST bloat is causal.** 149 MB = 160 kB heap +
  **112 MB TOAST** for 20 live rows: the big jsonb values UPSERTed over and over. The
  4.95 s snapshot write is the notifications-sized rewrite holding a connection mid-flush.
- ✅ **EFFECT 2 — slow delivery + flush.** `deliver:notifications` 5.9 s max (slowest
  push); worst `flushNotifies` 21.8 s; recurring ~828 ms steady-state flushes track the
  constant notifications churn.
- ✅ **EFFECT 3 — intermittent pool exhaustion (the prior session's "root cause").** Per-
  backend Pool max 16 / loader gate 10; spikes only *during* the big-blob storms. This
  window's `[acquire]` max = **81 ms** (not 44.6 s). "Simple queries take seconds" = pure
  wait — an 88 kB / 20-row trigger table can't scan for 3 s (14 piled at boot, atMs 5.5 s).

### Discarded as the *primary* cause (real but downstream / 2nd-order)
- ❌ **DB-pool exhaustion as a chronic state** — 2026-06-29 (2): intermittent symptom of
  the big-blob storms, not a standing condition (81 ms acquire between storms).
- 🔬 **Per-worktree local heavy-read gate (size 2)** = 21,858 ms — real but 2nd-order;
  revisit only after the big-blob resources are bounded.

### Cold boot
- ✅ **True cold-boot captured** — 2026-06-29 (2): the live profile starts at backend
  boot; atMs 5–33 s is the fan-out (all resources re-subscribe at once) and reproduces
  the original ~7 s+ symptom (21.8 s worst flush, the notifications mega-flush + the
  14-query trigger herd). `benchmark_boot` still excludes server-boot work (catch-up,
  derived-table rebuild) — secondary now that the driver is known.
