# Issue: cold-boot fan-out

**Status: ONGOING** — the remaining `< 1 s including cold start` violator (the goal in
[`CLAUDE.md`](./CLAUDE.md)). Captured but not yet driven to a structural root.

## Current understanding

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
- 🔬 **Simultaneous fan-out as its own amplifier** — every resource re-subscribing at once is what
  makes the git-loader cold misses contend on the 4-slot gate. Not yet traced to a structural fix
  (stagger / prioritize first-paint-critical resources / warm the memo / widen the boot-window gate).

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
