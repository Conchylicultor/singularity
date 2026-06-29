# Performance investigations

Living index of the performance work. **We keep fixing the wrong path** — so the
rule here is: *measure and confirm the root cause without doubt before changing any
code.* Each session re-validates the prior session's conclusion against fresh data
rather than inheriting it.

> **MANDATORY:** before any perf investigation, profiling pass, or perf fix, agents
> **MUST** follow the [`perfs-investigation`](../../.claude/skills/perfs-investigation/SKILL.md)
> skill. It encodes the method below as enforced phases + stopping gates (rate×cost,
> trace-to-origin-not-hotspot, sufficiency/legitimacy/counterfactual gates,
> containment-vs-cure altitudes). The summary below is the index; the skill is the procedure.

## Goal

**Make the app feel instant: any page loads in < 1 s, including cold start.**

## Method (non-negotiable) — see the [`perfs-investigation`](../../.claude/skills/perfs-investigation/SKILL.md) skill for the full procedure

1. Reproduce and quantify with the `benchmark_boot` MCP tool **and** the live
   `get_runtime_profile` (aggregate `waits`, not just `avgMs`).
2. Separate **work** from **wait** — a high `avgMs` with a high wait / low `workMs`
   is queueing, not a slow op. Find the *dominant* wait layer before theorizing.
3. **Decompose every cost into `rate × cost-per-occurrence` and trace to the origin, not
   the hotspot.** The biggest number is usually a downstream *amplifier*; amplitude is not
   causality. A `no-op`/`redundant`/`unchanged` signal means look *upstream*. Stop only at an
   event that *legitimately* should occur at that rate (the legitimacy gate) — not at the first
   sufficient cause.
4. Only after the root cause is confirmed beyond doubt (three converging lines of evidence),
   write a fix plan — and name its altitude (containment = make it cheap / cure = make it not
   happen).

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
  take seconds" = pure wait (an 88 kB / 20-row table can't scan for 3 s). The fix (one
  notification row per fingerprint) **landed on main** (`a8f9da4b6`).

- **2026-06-29 (3) — [snapshot TOAST bloat + unconditional no-op persist (root cause confirmed)](./2026-06-29-snapshot-toast-bloat-noop-persist.md).**
  Re-validated the landed notifications fix on main: `notifications` value **1.88 MB →
  42 kB**, undismissed report rows **21,803 → 27**. But the multi-second flush stalls
  persist one layer down. The new dominant event is a **22.4 s `flushNotifies` = one
  `live_state_snapshot` UPSERT stalling 21.9 s** (avg 26 ms — a lone outlier) that
  serial-blocks every co-flushed resource (their ~22 s "deliveries" are pure wait).
  Cause: `live_state_snapshot` is **181 MB TOAST for 20 rows** (11 k dead TOAST tuples,
  ~3 M lifetime UPDATEs) — pure bloat, never reclaimed because session 2's deferred
  `VACUUM FULL` **was never run** (`last_vacuum = null`; bloat grew 112 → 181 MB). The
  bloat is re-fed structurally: the runtime **UPSERTs the full value on every flush
  unconditionally, including no-op pushes** (persist precedes the diff; 6 keyed
  resources fire ~2 no-op pushes/s each = 32 k logged `live-state-noop`). Fix plan:
  (1) one-time `VACUUM FULL`, (2) skip the persist when the value is unchanged. **Root
  cause confirmed beyond doubt; pending user go-ahead.** *Refined by session 4: the
  persist-skip is the tail; the no-op pushes themselves have an upstream origin.*

- **2026-06-29 (4) — [no-op-push churn traced to its origin (the 1 Hz poller) + methodology](./2026-06-29-noop-push-churn-traced-to-origin.md).**
  Re-validated session 2 (notifications fix landed: 1.88 MB → 42 kB, 21,803 → 27 undismissed).
  Then traced the residual stalls *upstream* instead of optimizing the hotspot. The 22 s flush =
  one 21.9 s `live_state_snapshot` UPSERT — but that is the most-*amplified* node, not the driver.
  Walked the chain three hops past "solved": no-op recompute (×12/s) ← FULL-table invalidation ←
  change-feed trigger firing on a **zero-row statement** ← `INSERT … ON CONFLICT DO NOTHING` that
  fully conflicts ← the conversations poller re-adopting cross-worktree tmux sessions as "orphans"
  ← **it polls every 1 s** (the origin — illegitimate per the no-polling rule). Evidence:
  `live_state_changelog` `conversations` INSERT 2.62/s vs only 2,280 rows ever inserted; 32,107
  `live-state-noop` across 6 resources. Layered fix in
  `research/2026-06-29-global-noop-statement-invalidation-churn.md`: **boundary invariant**
  (trigger never invalidates on zero rows — ready) + **origin cure** (fix the poller — needs one
  more hop); persist-skip + one-time `VACUUM FULL` demoted to defense-in-depth. Extracted the
  method into the mandatory [`perfs-investigation`](../../.claude/skills/perfs-investigation/SKILL.md)
  skill. **No code changes — handed off for implementation.**

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

### Confirmed root cause (2026-06-29 session 4 — current, ORIGIN-first cause→effect)
- ✅ **ORIGIN: the conversations poller re-issues a zero-row write ~2.6/s.** It runs on a
  1 Hz `setInterval` (`conversations/server/internal/poller.ts:25,263`) and re-adopts
  host-wide tmux sessions it can't reconcile (cross-worktree) as "orphans" via
  `insertConversationOnConflictDoNothing` → `.onConflictDoNothing()` that fully conflicts
  (0 rows inserted). Illegitimate per the repo's no-polling rule. Evidence:
  `live_state_changelog` `conversations` INSERT 2.62/s vs `n_tup_ins` = 2,280 rows ever.
- ✅ **AMPLIFIER 1 — change-feed trigger fires on zero-row statements.** `live_state_notify()`
  is STATEMENT-level; an empty transition table still NOTIFYs, and `array_agg(pk)` over it is
  NULL → routed as **FULL-for-table**, invalidating *every* resource reading `conversations`.
- ✅ **AMPLIFIER 2 — invalidation → no-op recompute.** 6 keyed resources fire **~2 no-op
  pushes/s each** (32 k logged `live-state-noop`): loader reruns, value identical, empty diff.
- ✅ **AMPLIFIER 3 — unconditional full-value snapshot UPSERT (the persist tail).** `drainEntry`
  persists the full ~0.4 MB blob even on a no-op (persist precedes the diff; no value compare;
  `resource-runtime/core/runtime.ts` 1404–1419).
- ✅ **EFFECT 1 — `live_state_snapshot` TOAST bloat.** **181 MB TOAST / 20 live rows** (11 k dead
  TOAST tuples, ~3 M lifetime `n_tup_upd`); the deferred one-time `VACUUM FULL` was never run
  (`last_vacuum = null`; grew 112 → 181 MB since session 2).
- ✅ **EFFECT 2 — multi-second flush stalls (the headline symptom).** A single UPSERT into the
  bloated TOAST stalled **21.9 s**; `flushNotifies` serializes, so it inflated every co-flushed
  resource's delivery to ~22 s (pure wait). *This is the most-amplified node — fixated on by
  sessions 1–3 — not the driver.*

> Fix altitudes (see `research/2026-06-29-global-noop-statement-invalidation-churn.md`):
> **boundary invariant** at AMPLIFIER 1 (trigger never invalidates on zero rows — kills the
> whole class), **cure** at ORIGIN (fix the poller). AMPLIFIER 3's persist-skip + the one-time
> `VACUUM FULL` are defense-in-depth.

### Confirmed + FIXED (landed on main `a8f9da4b6`, 2026-06-29 session 2)
- ✅ **`notifications` was a 1.88 MB unbounded monolith** (21,803 undismissed rows, no
  `LIMIT`) — the worst single blob. **GROWTH:** `recordReport` filed a notification per
  report (~281/h), deduped by `(reportId, timeBucket)` → ~26× row blow-up, never
  auto-dismissed for `warning`/`error`. **Fix:** one notification row per fingerprint
  (count + in-place re-surface) + TTL closes the warning/error gap. Re-validated session 3:
  value **1.88 MB → 42 kB**, undismissed report rows **21,803 → 27**, `deliver:notifications`
  max **5.9 s → 341 ms**.

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
