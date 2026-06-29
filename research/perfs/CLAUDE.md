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

### Conversation load 40+ s → main-thread event-loop block (Ongoing — START HERE)

"Loading a conversation takes 40+ s" was traced **past** DB-pool exhaustion, the git gate, and the
fan-out herd (all measured to be victims/triggers, not the cost) to its real layer: the main backend's
**single event loop is monopolized by one synchronous CPU operation for 10–46 s**, dozens of times a day
(`health.jsonl` `eventLoopMaxMs` 45.8 s peak, `gcPreciseCount:0`, `heavyReadDepth:0`, PG idle at 3 active
backends). The fan-out herd (every push auto-restarts main → fleet re-subscribe) is the **trigger**;
the wall-clock is the block. **Exact synchronous culprit not yet named** (suspects: the live-state
flush/push cascade — `flushNotifies` pure-work 10.5 s; the `stats/*` endpoints 65–77 s). Next step: one
CPU profile during a stall. Full arc + discarded hypotheses (incl. why DB-pool/serve-stale were demoted)
→ **[`2026-06-29-conversation-load-40s-eventloop-block-HANDOFF.md`](./2026-06-29-conversation-load-40s-eventloop-block-HANDOFF.md)**.

### Cold-boot fan-out (Ongoing)

The remaining `< 1 s including cold start` violator — and the cause of **"loading a conversation
takes 40+ s"** (2026-06-29). At backend boot *and on every WS reconnect* all live-state resources
re-subscribe at once; the scarce resource is the **per-backend 10-slot DB loader gate + the single
event loop** (NOT the host git gate — loaders are fast in isolation even under host-gate saturation:
`edited-files` 1.4 s, `commits-graph.delta` 0.7 s). The ~30-resource simultaneous fan-out saturates
those 10 slots, queueing every loader's query into the 40–75 s tails (`[acquire]` max 75.9 s);
the conversation's own loaders are downstream **victims**. Confirmed beyond doubt (live profile +
`slow_ops` + `benchmark_boot`); the no-op churn fix re-validated as holding. Full detail + sessions
+ checklist → **[`issue-cold-boot-fanout.md`](./issue-cold-boot-fanout.md)**.

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
