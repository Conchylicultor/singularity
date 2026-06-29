# Issue: git-derived loaders — `edited-files` / `commits-graph`

**Status: ONGOING** — the dominant remaining real cost once the
[no-op churn](./issue-live-state-noop-churn.md) was fixed. This is the *original* cause (A) from the
2026-06-28 assessment, de-prioritized while the big-blob churn masked it, now unmasked.

## Current understanding (2026-06-29, session 6 decomposition on `singularity`)

The still-firing slow ops are `element`-kind `edited-files` / `commits-graph.delta` at ~1.3–1.5 s
(distinct from the now-fixed churn — this is *legitimate but expensive git work*, not illegitimate
high-rate work). Work-vs-wait split from the live loader profile:

| Loader | avg | workMs | dominant wait | verdict |
|---|---|---|---|---|
| `edited-files` | 576 ms | **569** | none (memo hit ~30 ms typical) | **work-bound** — misses do ~1.3–1.5 s of real git work |
| `commits-graph.delta` | 941 ms | 82 | **`heavy-read-local` ~843 ms** | **wait-bound** — a *victim* of the gate |

- **`edited-files` (the driver).** On a memo miss it runs **4 sequential git spawns** —
  `merge-base`, `diff --name-status`, `status --porcelain --untracked=all`, `diff --numstat` — plus
  untracked line-counting, all under `withHeavyReadSlot`
  (`conversation-view/code/server/internal/get-edited-files.ts:90`). On an 18-CPU host the gate is
  only **4 slots host-wide / 2 per worktree** (`floor(cpus/4)`). Typical case is a fast memo hit
  (~30 ms); the ~1.3–1.5 s misses are the `element` slow ops, plus 9–18 s cold misses during the
  cold-boot herd (see [cold-boot fan-out](./issue-cold-boot-fanout.md)).
- **`commits-graph.delta` (the victim).** Its own work is only 82 ms; it spends ~843 ms **waiting on
  the host gate behind `edited-files`** (`commits-graph/server/internal/compute-graph.ts`). Head-of-
  line blocking, not slow itself.

### Open rate-axis suspicion (trace before any cost-axis fix)

Per the [`perfs-investigation`](../../.claude/skills/perfs-investigation/SKILL.md) method, don't jump
to the cost axis ("parallelize/cache the git op") yet. The @parcel watcher
(`watch-edited-files.ts`) recomputes on **every** fs event (debounced 200 ms, ceiling 2000 ms) and
its unchanged-result early-return happens **after** paying the full ~1.3 s git compute (`recompute()`
computes → serializes → *then* compares). So an fs event that doesn't change the diff (mtime touch,
editor temp file, write-then-revert, anything outside the IGNORE globs) still burns a full git
computation and holds a gate slot — **the same no-op shape as the fixed churn, on the fs-watch
axis.** Needs measuring (recompute rate vs. real change rate) to decide the altitude: make the git
cheaper / off the critical path (cost) vs. don't recompute on no-change events (rate / origin).

**Next:** a Phase-2 trace of the watcher recompute rate vs. actual edited-files change rate on an
active worktree.

## Causes — checklist

Legend: ✅ confirmed with data · ❌ discarded (with reason) · 🔬 open / needs proof

- 🔬 **`edited-files` cold-miss compute is the driver** — 2026-06-29 (6): work-bound, ~1.3–1.5 s of
  real git work per memo miss (4 serial git spawns). Open: is the watcher recompute *rate* legitimate,
  or amplified by no-change fs events (recompute pays full git cost *before* the unchanged-result
  early-return)? Phase-2 trace pending.
- 🔬 **Per-worktree local heavy-read gate (size 2 = `ceil(host/2)`)** = 21,858 ms (session 2) and now
  the live wait for `commits-graph.delta` (workMs 82 vs ~843 ms `heavy-read-local`). Real, and no
  longer 2nd-order now that the big-blob churn is bounded — the gate behind which the git loaders
  queue. Revisit alongside the driver above.
- ❌ **Git loaders' work is slow (as a flat claim)** — 2026-06-29: `edited-files` work = 16 ms
  (prod, **memo-warm**), `commits-graph.delta` work ≈ 31 ms. *Nuanced by session 6: the memo-warm hit
  is ~30 ms, but a memo **miss** does the full ~1.3–1.5 s git compute — so the cost is real on the
  miss path, not the hit path.*
- ❌ **Host-wide heavy-read gate (`withHeavyReadSlot`, host size 4) is the contention** — 2026-06-29:
  `heavy-read-acquire` (the *host-wide* flock wait) = **17 ms total** across all loaders. Negligible.
  *The original git-off-critical-path plan targeted only this — hence "wrong path". The contention
  that does bite is the **per-worktree** `heavy-read-local` tier above, not this host-wide one.*

## Sessions

- **2026-06-28 — [boot & git-loader slowness assessment](./2026-06-28-boot-and-git-loader-slowness-assessment.md).**
  Named cause (A): git-derived loaders (`edited-files`, `commits-graph`) on the first-subscribe
  critical path under the host heavy-read gate. Flagged as a primary suspect. *Superseded as the
  *primary* driver by the 2026-06-29 sessions (the churn dominated), but the underlying git cost was
  never disproven — only out-prioritized.*

- **2026-06-29 — [DB-pool exhaustion vs git loaders (root-cause hunt)](./2026-06-29-db-pool-exhaustion-flush-cascade-findings.md).**
  Measured the git loaders directly: **16–315 ms in isolation, 172–448 ms under a fully-saturated
  host heavy-read gate** — not the 7 s symptom. Concluded they were *victims* of DB-pool exhaustion,
  and the `heavy-read-acquire` gate wait was then only 17 ms total. *Re-opened by session 6: with the
  churn (and thus the pool exhaustion) gone, the git loaders' own work — and the per-worktree
  `heavy-read-local` gate wait — are now the top remaining cost. Session 2's checklist had parked
  this as "🔬 per-worktree heavy-read gate = 21,858 ms — real but 2nd-order; revisit after the
  big-blob resources are bounded."*

- **2026-06-29 (6) — decomposition (recorded above).** Re-measured on `singularity` after the churn
  fix: `edited-files` work-bound ~1.3–1.5 s/miss; `commits-graph.delta` wait-bound on the 4-slot
  gate; opened the watcher no-change-recompute rate-axis question. Surfaced while answering "we're
  still detecting slow ops — is it another issue?" (yes — this one). No code changes; Phase-2 trace
  pending.
