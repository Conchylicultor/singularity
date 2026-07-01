# Issue: cold-boot fan-out

**Status: ONGOING** — the remaining `< 1 s including cold start` violator (the goal in
[`CLAUDE.md`](./CLAUDE.md)). Captured but not yet driven to a structural root.

## Current understanding

> **2026-06-29 refinement (conversation-load 40 s session):** the herd also fires on **WS
> reconnect**, not just backend boot, and the dominant wait is the **per-backend DB-pool loader
> gate** (10 of 16 connections), *not* the host heavy-read git gate. The git loaders are fast in
> isolation **even under host-gate saturation** (`benchmark_boot` load=8: `edited-files` 1.4 s,
> `commits-graph.delta` 0.7 s) — they are **victims** of the simultaneous ~30-resource fan-out
> saturating 10 loader slots + the single event loop, which is what produces the 40–75 s tails
> (`[acquire]` max 75.9 s). Full session →
> [`2026-06-29-conversation-load-40s-fanout-herd.md`](./2026-06-29-conversation-load-40s-fanout-herd.md).

At backend boot every live-state resource re-subscribes at once. The git-derived loaders cold-miss
(no warm memo) and contend on the **4-slot** host heavy-read gate, producing 9–18 s `edited-files` /
`commits-graph` spans during the burst — this reproduces the original ~7 s+ symptom. The boot herd is
essentially *when the [git-loader cost](./issue-git-derived-loaders.md) is worst* (every worktree's
first compute, all at once, against a tiny gate), so the two issues overlap; fixing the steady-state
git cost will blunt the herd but the simultaneous fan-out is its own amplifier worth bounding (stagger
/ prioritize first-paint-critical resources, warm the memo, or widen the gate for the boot window).

**Measurement gap:** `benchmark_boot` still excludes server-boot work (catch-up, derived-table
rebuild), so the harness under-counts true cold start. Secondary to the steady-state git-loader cost
for now.

## Causes — checklist

Legend: ✅ confirmed with data · ❌ discarded (with reason) · 🔬 open / needs proof

- ✅ **True cold-boot captured** — 2026-06-29 (2): the live profile starts at backend boot; atMs 5–33 s
  is the fan-out (all resources re-subscribe at once) and reproduces the original ~7 s+ symptom (21.8 s
  worst flush — at the time the notifications mega-flush + the 14-query trigger herd; post-churn-fix it
  is the git-loader cold misses). `benchmark_boot` still excludes server-boot work (catch-up,
  derived-table rebuild) — secondary now that the steady-state driver is known.
- ✅ **Simultaneous fan-out is the amplifier — and it saturates the per-backend DB-pool loader
  gate (10 slots) + the event loop, not the host git gate** — 2026-06-29 (conversation-load 40 s):
  three converging lines (live profile, `slow_ops`, `benchmark_boot`). Loaders fast in isolation
  even under host-gate saturation (1.4 s / 0.7 s); 8 stats endpoints + the conversation loaders all
  max in one shared stall window (65–77 s and 35–46 s); `[acquire]` max 75.9 s. Fires on **WS
  reconnect**, not just boot. Structural fix still open (admission control / stagger / snapshot-serve
  non-boot-critical keys on reconnect). See the session doc.
- 🔬 **Reconnect vs boot vs change-feed as the herd trigger** — the recurring (not one-off) sub
  averages imply WS reconnects re-subscribing all resources. Instrument what enqueues each fan-out
  burst before the fix.
- ✅ **The multi-minute `flushNotifies` peak belongs to THIS herd, not the git loaders** — 2026-07-01 (2),
  moved here from [`issue-git-derived-loaders.md`](./issue-git-derived-loaders.md). At boot/catch-up
  `live-state-snapshot.onReady` drives the **bootCritical DB set** (`queue-ranks`, `tasks`, `attempts`,
  `conversations-active`, …) through `flushNotifies` FULL (`recomputeResource(key)` + `runCatchUp()` →
  `drainEntry(persisted)`: captureWatermark + FULL loader + persistSnapshot). Serialized by the flush's
  level barriers + single-active-flush mutex and gated by the **DB-pool** `loader-acquire` tail (40–75 s),
  that is what inflates `flushNotifies` to minutes — a DB-pool cost. The git loaders (`edited-files`,
  `commits-graph`) are `external`/non-`bootCritical`, run `sub`-origin only, and do NOT block the flush
  (a coherent window shows the flush at ≤1.3 s / 6 ms while 31.9 s `edited-files` subs run concurrently).
  So a live-state UI update (e.g. a new conversation in the sidebar queue) delayed for minutes is this
  fan-out herd on the DB-pool gate, not a git-gate problem. **Same structural fix as the herd** (bound /
  stagger the fan-out; snapshot-serve non-boot-critical keys on reconnect; admission control).

## Sessions

- **2026-06-28 — [boot & git-loader slowness assessment](./2026-06-28-boot-and-git-loader-slowness-assessment.md).**
  Framed the cold-start goal and identified boot fan-out + the host heavy-read gate as part of the
  contention picture (causes A/B).

- **2026-06-29 (2) — [notifications unbounded resource = the driver](./2026-06-29-notifications-unbounded-resource-root-cause.md).**
  **True cold-boot captured**: the live profile starting at backend boot shows atMs 5–33 s is the
  fan-out (all resources re-subscribe at once), reproducing the original ~7 s+ symptom (21.8 s worst
  flush — at the time the notifications mega-flush + a 14-query trigger herd). Noted `benchmark_boot`
  excludes server-boot work; deprioritized while the churn driver was being fixed.

- **2026-06-29 (6) — [no-op churn validated on `singularity`](./2026-06-29-noop-churn-fix-validated-on-main.md).**
  With the churn gone, the residual boot-herd outliers are now the git loaders: 9–18 s `edited-files`
  / `commits-graph.delta` cold misses at atMs 5–15 s, contending on the 4-slot gate. Steady state is
  well within budget; the boot herd is the next legitimate target if the cold-start goal is pursued.

- **2026-06-29 — [conversation load 40 s = the fan-out herd](./2026-06-29-conversation-load-40s-fanout-herd.md).**
  Fresh investigation of "loading a conversation takes 40+ s". Confirmed beyond doubt (live profile +
  `slow_ops` + `benchmark_boot`) that the symptom is this herd: loaders are victims (fast in isolation
  even under host-gate saturation), the real scarce resource is the **per-backend 10-slot DB loader
  gate + the single event loop**, and it fires on **WS reconnect** as well as boot. Churn fix
  re-validated as holding. No code changes; fix altitudes named (origin = bound the fan-out;
  containment = widen the gate / parallelize `edited-files`' 4 serial git spawns, ~1.4 s even warm).
