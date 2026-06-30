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

> **KEEP THESE DOCS CURRENT — non-negotiable.** This index **and** the per-issue docs are *living*
> documents. Every time you make a new discovery — name a hotspot, kill a hypothesis (with the gate
> that killed it), confirm/refute a suspect, peel a deeper layer, or re-validate a number — update the
> relevant issue doc **and** this index's one-paragraph summary **in the same turn**, before you stop.
> A superseded suspect list left in place is how the next session re-derives the wrong path.

> **STATUS STAYS `(Ongoing)` — do not promote prematurely.** Naming the *hotspot* is **not** finding
> the *root cause*: you are almost always one layer short (the hotspot is where the cost *shows up*,
> not why the work happens). Keep an issue `(Ongoing)` while live — never "named / fix-planned /
> solved" — and only mark `(Completed)` once a fix has **landed AND been re-validated on data** (the
> numbers moved on `singularity`). Record discoveries in the body; leave the status conservative.

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

### Conversation load 40+ s → main-thread event-loop block → `buildPluginTree` over-extraction (Ongoing)

"Loading a conversation takes 40+ s" was traced **past** DB-pool exhaustion, the git gate, and the
fan-out herd (all victims/triggers) to its real layer: the main backend's **single event loop
monopolized by one synchronous op for 10–46 s**. The on-stall JSC flight recorder
(`debug/health-monitor`, `logs/stall-profiles.jsonl`) named the **hotspot: `buildPluginTree`** —
`plugin-meta/plugin-tree` Step 4b, a synchronous `node × facet` `readFileSync` walk over **4408
source files / 10.6 MB**, run **uncached** on `GET /api/plugin-view/tree`. Three converging lines:
profile (`readFileSync` 59.6 %, `sampleRateHz 176` ⇒ real in-process block, not CPU starvation) +
system data (`/api/plugin-view/tree` max 10.3 s with `allow-files`/`viewed` queued at the consecutive
timestamps right behind it ⇒ loaders are **victims**) + code. **Suspects killed by data:** `stats/cost/*`
(handoff #2) chunks per-file (18 ms max block, measured) — victim; no resource value > 444 kB; CPU
starvation killed by `sampleRateHz`; a pre-capture speculative suspect-map (`persist.ts` `JSON.stringify`,
`tableToResources`, …) **falsified** — none in the captured stack.
**⚠️ Deeper layer (still being designed — do NOT stop at the hotspot):** the per-call cost is **NOT
irreducible**, so caching it would be containment hiding waste. `handleTree` eagerly builds **all 9
facets** (4 of which `readFileSync`-walk every source file) **plus `classifyEdges`/`disabledClosure`,
to populate `facets`/`disabled` that its own hot consumers throw away** — `explorer` renders no
`disabled`, `config-nav` builds `facets:{}` itself, `plugin-link` uses only `description`. They need
only the cheap async structural skeleton (steps 1–3, `collectCoreFields`); only the Studio
**Contributions** tab (all-plugins facets) and the **detail pane** (one plugin's facets) genuinely
read facets. **Real cure (origin, not cache):** make the tree **structure-only** for the hot path,
and source facets lazily (a single cached, fast aggregate shared by Contributions + the detail pane —
**not** per-plugin, since the detail pane shows `importedBy`, a relate reverse-index needing all plugins).
**Altitude 2 (fast aggregate algorithm) LANDED & validated on the worktree (2026-06-30):** async
read-once in-memory FS snapshot → facet `extract` touches zero disk → **max event-loop block 50 s → ~1.5 s
cold / ~0.3 s warm**, output byte-identical; end-to-end, a concurrent cheap endpoint stays <75 ms *during*
an 8 s tree build (no longer a victim). **Still TODO:** Altitude 1 (structure-only default + cached
accessor → hot path to ms; client-derived `disabled` cascade — the prior doc's "explorer needs no
disabled" was **wrong**); not yet on `singularity` (needs a push). Two corrections vs the design doc:
explorer DOES render `disabled` (derive client-side from the composition graph); per-plugin facets are
infeasible for the detail pane (`importedBy`). Full arc → newest implement doc
**[`2026-06-30-buildplugintree-structure-only-IMPLEMENT.md`](./2026-06-30-buildplugintree-structure-only-IMPLEMENT.md)**;
design **[`2026-06-29-perfs-buildplugintree-eventloop-block-FIX.md`](./2026-06-29-perfs-buildplugintree-eventloop-block-FIX.md)**;
predecessor [`…-HANDOFF.md`](./2026-06-29-conversation-load-40s-eventloop-block-HANDOFF.md).

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
