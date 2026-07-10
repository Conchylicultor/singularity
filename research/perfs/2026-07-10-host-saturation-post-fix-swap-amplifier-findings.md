# Host saturation, post-fix findings: pool collapse cured at its layer; swap-in is the lag amplifier

**Track:** [Host saturation — agent build/check fleets starve the main backend](./2026-07-08-host-saturation-agent-checks-starve-main.md) (Ongoing).
**Predecessor session:** the 2026-07-09 incident forensics + fix direction →
[`../2026-07-09-global-interactive-lane-under-load.md`](../2026-07-09-global-interactive-lane-under-load.md).
**Scope of this doc:** findings only — no remediation proposed (explicit session decision).

## Timeline covered

Four user-facing freezes of the main app:

| When | Shape | Status of fixes |
|---|---|---|
| 07-09 ~11:07 | `read-admit` convoy (6/6, **1,377 queued**; subs 270 s) | pre-fix |
| 07-09 ~14:25 | `db-pool` eaten (16/16, **339 queued**, pg idle, 5 idle-in-txn; `db-acquire` waits 120 s) | pre-fix |
| 07-09 ~16:18 | same, 4 type-check fleets (~16 workers) from `build`+`check`+`check type-check`×2-same-worktree | pre-fix |
| **07-10 ~03:29** | **frozen again** (`GET /api/tasks` 3×30 s timeouts, loop p50 1.3–1.5 s, load 36.8) | **both fixes deployed** (backend restart 02:56) |

Fixes referenced: `fbcaec47c` (interactive lane — DB pool partitioned by origin class, transactions
leased, jobs gated) and `e24e6040a` (type-check worker fleet bounded host-wide, lane-keyed flock pool).

## Findings

### 1. Both landed fixes verified working at their own layer — during a live freeze

At the 07-10 03:29 freeze, with both fixes deployed:

- **Worker fleet bounded:** exactly 9 type-check workers alive = the lane budget B = min(cpus/2,
  0.5·totalmem/2.7 GB) — vs 16–40 during the 07-09 incidents. The unbounded-fleet pile-up shape is gone.
- **DB layer healthy while the app was frozen:** postgres showed 3 active SELECTs, no lock queue, one
  transient idle-in-transaction — nothing resembling the 07-09 pool collapses. The freeze happened
  *anyway*, i.e. the binding constraint is no longer the DB queue.

(Not yet verified: the incident report's T1 synthetic-load acceptance test has still never run — the
`fbcaec47c` commit message says so explicitly. The at-layer verification above is observational, not
the controlled test.)

### 2. The freeze survived by moving down a layer: pool-queue amplifier → hop-count × lag-quantum

Pre-fix chain: load → loop lag → lease inflation → pool FIFO collapse (**×100 amplifier**, minutes).
Post-fix chain: load → loop lag ~1.3–1.5 s p50 → **~10–30 await hops per interactive endpoint**
(`GET /api/tasks`: pool acquire + query + serialization of 3,666 rows) → **>30 s** (**~×20
amplifier**, tens of seconds to timeout). No queue required: pg was idle, the interactive lane held —
the JS between queries simply doesn't get scheduled/completed at a usable rate.

### 3. Load composition changed: no single fleet to bound — the *aggregate agent fleet* crosses the knee

Top consumers at the 03:29 freeze (load 36.8): **`fseventsd` at 80 % CPU** (system file-event daemon
amplifying worktree churn), WindowServer 40 %, ~6 concurrent `claude` agent processes at 12–20 % each,
their vite/drizzle-kit/build subprocesses, and the 9 capped workers at 12–14 % each. Death by a
thousand cuts: every class individually bounded or modest; the sum is past the knee.

### 4. NEW — the dose–response is really (load × swap-in) → lag; the QoS boost works against pure CPU

Cross-tab of backend event-loop p50 lag by host load band × swap-in band (9,608 paired samples from
`health.jsonl` × `health-host.jsonl`, which records `swapInPagesPerSec`):

| | swapIn ≈ 0 | swapIn mid | swapIn HIGH |
|---|---|---|---|
| load < 24 | 1 ms (n=7471) | 1 ms (n=43) | 2 ms (n=2) |
| load 24–40 | **2 ms** (n=1508) | 19 ms (n=121) | 49 ms (n=65) |
| load 40+ | 85 ms (n=382) | 15 ms (n=16) | 433 ms (n=1) |

Two conclusions:

- **`boostInteractiveQos()` is effective against pure CPU contention** — load 24–40 with no swap
  costs 2 ms, load 40+ costs 85 ms (degraded, not dead). This *re-validates the 07-08 track's fix*
  (the "main at default QoS, same tier as the storm" cause is cured) and **kills the hypothesis "the
  QoS boost is ineffective"** (killed by counterfactual on data: the boost's protection is visible in
  the no-swap column).
- **Memory pressure is the amplifier that defeats QoS.** Swap-in turns the same load bands into
  19–433 ms; the live freezes (p50 1.3–1.5 s) exceed even the worst historical cell, consistent with
  sustained swap-in during fleet bursts (host swap was 2.7/4 GB used at the 03:29 sample). Mechanism:
  a page fault blocks the boosted thread synchronously — scheduling tier is irrelevant to a thread
  waiting on page decompression/SSD read-back.

### 5. Hypothesis (🔬 open, untested): the backend is the host's ideal paging victim

Proposed explanation for the long-standing "Mac stays smooth, only this app dies" observation: macOS
pages out least-recently-touched memory. Foreground apps' working sets stay hot. The main backend is
mostly idle between requests and carries a large, churning heap (±150 MB/10 s swings in `health.jsonl`
⇒ its pages spread wide and go cold), so it gets progressively paged out during a fleet burst; the
next request faults its way back in at ~ms/page → the 1.3–1.5 s quanta. Discriminating predictions
(none run yet):

- **Cold-switch test (user-runnable):** during a freeze, first interaction with an app untouched for
  30+ min should hitch 1–3 s; a recently-used app stays instant. If cold apps are also instant →
  hypothesis wrong.
- **Twin probes:** two standalone bun loop-lag probes during a freeze — tiny heap vs one
  allocating/touching a few hundred MB. Prediction: tiny stays ~1–5 ms (per the 2 ms cell), fat shows
  100 ms+ spikes. Divergence confirms working-set shape (not scheduling) as the residual mechanism.
- **Unboosted benchmark:** `time openssl speed -seconds 2 sha256` idle vs during freeze → predicted
  1.5–3× slower during (the CPU floor every non-boosted process pays); Activity Monitor memory
  pressure yellow/red during freezes.

### 6. Corrections to prior assumptions, recorded

- **Fleet spawner set is `build` ∪ `push` ∪ bare `check`** (push runs the check suite first) — an
  admission fix at the build command would have missed today's exact freeze; `e24e6040a` gates at the
  worker spawn, which covers all three. Also observed: one worktree ran **two identical concurrent
  `check type-check` passes** (duplicate work, no single-flight).
- The 07-09 report's Gap analysis (origin blindness / transaction bypass / ungated jobs) is confirmed
  closed by `fbcaec47c`'s design (two background gates with `TX 3 + QUERY 7 ≤ 10` asserted at module
  load; `pool.connect()` leases; `runInBackgroundLane()`); observational evidence consistent (healthy
  pg during the 03:29 freeze), controlled T1 evidence still missing.

## Causes checklist (current, post-fix freeze shape)

- ✅ **Aggregate agent-fleet load × memory pressure → 1.3–1.5 s loop-lag quantum**; interactive
  endpoints die by hop-count × quantum with a healthy DB layer (03:29 freeze, measured).
- ✅ cured & verified at-layer: DB pool FIFO collapse (`fbcaec47c`); unbounded worker fleets (`e24e6040a`).
- ❌ "QoS boost ineffective" — killed by the cross-tab no-swap column (counterfactual on data).
- ❌ DB-layer collapse as cause of the 03:29 freeze — pg healthy during it.
- 🔬 cold-page victim hypothesis (predictions above, none run).
- 🔬 `fseventsd` 80 % CPU — origin unattributed (whose events? worktree churn × how many watchers?).
- 🔬 what exactly stretches `GET /api/tasks` past 30 s — hop count alone vs long synchronous tasks
  (needs a stall profile / `stall-profiles.jsonl` capture during a freeze).
- 🔬 swap-in bursts: correlated with agent *count*, or with specific phases (bun install, vite, DB fork)?

## Next measurements (measurements only — remediation deliberately not proposed here)

1. Run the twin-probe discriminator during the next freeze (§5).
2. Capture/inspect `stall-profiles.jsonl` during a freeze to name main-thread work, if any.
3. Attribute `fseventsd` load (fs_usage sampling / watcher inventory).
4. Run the incident report's T1 acceptance test for the interactive lane on a quiet box.
5. The 07-08 track's open "A/B main's p99 during the next burst" is *partially* answered by the
   cross-tab (bursts without swap barely move p99); a live burst A/B with swap present is the missing cell.
