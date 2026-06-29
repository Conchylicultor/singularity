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

> Each issue below keeps only a high-level paragraph; its own doc holds that issue's full session
> log **and its own Causes — checklist** (✅ confirmed · ❌ discarded · 🔬 open). One doc per issue
> (not a global log) so the history scales as issues accrue.

### Git-derived loaders — `edited-files` / `commits-graph` (Ongoing)

The dominant remaining real cost now that the churn is fixed — and the *original* cause (A), masked
while the big-blob churn dominated. Fresh decomposition on `singularity`: `edited-files` is
**work-bound** (~1.3–1.5 s of real git work per memo miss — 4 serial git spawns under the **4-slot**
host heavy-read gate, `floor(cpus/4)` on an 18-CPU box); `commits-graph.delta` is **wait-bound**
(workMs 82 vs ~843 ms waiting on that gate behind `edited-files` — a victim, not slow itself). Open
rate-axis suspicion before any cost-axis fix: the @parcel watcher recomputes on *every* fs event and
only early-returns the unchanged result **after** paying the full git compute — the same no-op shape
as the fixed churn, on the fs-watch axis. **Next:** Phase-2 trace of recompute rate vs real change
rate. Full detail + sessions + checklist → **[`issue-git-derived-loaders.md`](./issue-git-derived-loaders.md)**.

### Cold-boot fan-out (Ongoing)

The remaining `< 1 s including cold start` violator. At backend boot every resource re-subscribes at
once and the git loaders cold-miss (9–18 s) contending on the 4-slot gate; this reproduces the
original ~7 s+ symptom. Overlaps the git-loader issue (the boot herd is when the loader cost is
worst); `benchmark_boot` still excludes server-boot work. Secondary to the steady-state git-loader
cost. Full detail + sessions + checklist → **[`issue-cold-boot-fanout.md`](./issue-cold-boot-fanout.md)**.

### Live-state no-op churn & unbounded `push` resources (Completed)

The headline symptom — multi-second flush stalls, "simple pages take seconds" — traced past two
amplified hotspots (the `notifications` 1.88 MB mega-blob; the 181 MB `live_state_snapshot` TOAST
bloat) to its origin: the conversations poller re-issuing a **zero-row write every 1 s**, which the
STATEMENT-level change-feed trigger amplified into FULL-table invalidations → a ~12/s no-op recompute
+ full-blob snapshot-UPSERT storm. Both altitudes landed on main — the **boundary invariant** (trigger
never notifies on a zero-row statement) and the **origin cure** (stop re-adopting `done`-but-live
sessions), `1f6b27092`; plus the earlier notifications-growth fix `a8f9da4b6`. **Validated on
`singularity`:** flush **22.4 s → 571 ms**, `conversations` INSERT **4.0/s → 0.003/s**,
`live_state_snapshot` **155 MB → 14 MB**, `live-state-noop` accumulation stopped. Full arc + sessions
+ checklist → **[`issue-live-state-noop-churn.md`](./issue-live-state-noop-churn.md)**.
