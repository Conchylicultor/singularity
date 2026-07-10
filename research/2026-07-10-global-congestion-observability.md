# Congestion observability: unified timeline, onset sentinel, incident-aware shedding

**Status: plan approved-pending / implementation in this worktree.**
Delivery order (user-decided): **Phase A (timeline) → Phase B (sentinel) → Phase C (shedding)**, all on this branch.

## Context

Under load (many agents building/checking in parallel) the app becomes unusable — page loads > 1 min, then data takes more minutes — while the rest of the mac stays responsive. The host-saturation remediation stack landed on main (QoS demotion/boost `2a7660401`, Bun `idleTimeout` 60 s + log rotation `e70d327f7`, fleet admission lanes `e24e6040a`) but is **unvalidated**: a burst reproduced at full severity 2026-07-10 09:03–09:21Z (471 s `/agents` page load) where the dominant layer was **Postgres-side query latency under host contention + a deploy-restart boot burst** — NOT a backend event-loop stall (health p99 ≤ 466 ms) and NOT pool-acquire wait. The burst shape mutates as fixes land, so we need layer-complete observability, not another single-failure-mode detector. Full track state: [`research/perfs/CLAUDE.md`](./perfs/CLAUDE.md).

Three gaps this plan closes (from the 2026-07-10 monitoring-stack audit):

1. **Onset**: capture today is retroactive from the first *victim's* threshold trip, per-backend. Blind spots: Postgres internals (today's dominant layer — only an app-side backend count exists, sampled after something is already slow), non-main backend stalls (health line but no stack), cross-worktree onset (no fan-in; nothing observes "a build fleet just started" as an event), the boot window.
2. **Observer effect**: safeguards are good (`runWithoutProfiling`, background lanes, `ExcludeFromChangeFeed`, admission/velocity caps) but nothing defers persistence during an incident, and monitoring's own cost is invisible by design (undiagnosable from its own data).
3. **No unified timeline**: today's burst was reconstructed by hand across five stores. All join keys exist (`worktree`, `wallTime`, `traceId`); two cross-worktree fan-out precedents exist (slow-ops Cluster tab DB fan-out; Health pane disk scan). Nobody has built the merge.

Descoped from v1 (user-decided): gateway (Go) metrics; boot-window instrumentation beyond the tiny durable boot event Phase A needs.

## Verified facts the design rests on

- **Proxying WAKES dormant backends**: `handleHTTP` → `wt.Ensure(r.Context())` cold-starts (gateway/proxy.go:141). Any per-backend fan-out MUST filter `GET /gateway/worktrees` (proxy.go:314) on `state === "running"`.
- **Trace-engine ring facility is real and unused**: `defineTraceEventClass({ ring: { max } })` + `emit({tMs,data})` → the slice overlapping a trace's window persists automatically (engine `registry.ts:51-105`) — a Gantt lane for free for a continuous sampler.
- **Engine gap (B0)**: `assembleEvents` (engine `capture.ts:117-135`) always `safeParse`s enrich's return; an enrich-only class returning `undefined` files a spurious validation-error report on EVERY trace. Needs `if (raw === undefined) continue;`.
- **`captureFlightWindow()`** (runtime-profiler `core/recorder.ts:769`) is in-process only; no endpoint exposes it. Cross-backend precedent is gateway-mediated fetch (`mcp-tools.ts:83-97`).
- **`bun:jsc` sampling profiler has no stop API** — arming is a one-way per-process latch (stall-profiler.ts header).
- **Reusable as-is**: `openShortLivedClient` (max-1 pool) + `listDatabases` (`@plugins/database/plugins/admin/server`); NDJSON streaming fan-out with semaphore(6) + per-DB error rows (slow-ops `cluster/server/internal/handle-cluster.ts`); disk scan of per-worktree JSONL (`health-monitor/server/internal/read-health-files.ts:44-92`); `groupIncidents` sweep-union + `IncidentBadge` (trace `pane/web/internal/incidents.ts` — internal, needs export); `SlowEvents.View` tab slot (`defineTabbedView("debug.slow-events")`); Gantt components (debug/profiling web barrel); `getContentionSnapshot()` ≤1 s memo; `captureProcessTree()` (runtime-tmux); shed-then-flush precedent `reports/server/internal/buffer.ts` (replay idempotent via upsert).
- **Clock discipline**: profiler-clock values are incomparable across backends; correlate only via `wallTime` (engine CLAUDE.md:86-93).
- **Anti-amplification is non-negotiable**: `traces`/`slow_ops`/`reports` are `ExcludeFromChangeFeed` with recorded self-amplification reasons; everything new follows `runInBackgroundLane(() => runWithoutProfiling(...))`, and the timeline stays pull-only (never live, never polled).

---

## Phase A — Unified cross-worktree slow-event timeline

**Home**: new `plugins/debug/plugins/timeline/` (core/shared/server/web) + new `plugins/debug/plugins/boot-events/` (server only). The timeline is a **tab in Debug → Slow Events** via the existing `SlowEvents.View` slot (zero pane edits, same shape as the Cluster tab) — not a second sidebar home for the same data.

### Boot events (the one additive instrumentation piece)

A persisted **log-channel line, not a table** (no migration, survives DB re-forks, readable from main while a backend is wedged): `boot-events/server` `onReady` hook writes one line to `Log.channel("boot", { persist: true })` → `~/.singularity/worktrees/<wt>/logs/boot.jsonl`:
`{ sampledAt, worktree, processStartedAt: Math.round(performance.timeOrigin), readyAt }` — a boot renders as a wall-clock **interval** (deploy-restart bursts become visible bars). Tiny rotation cap (~256 KB). Reader `readBootEvents(worktree, windowMs)` exported from the barrel.

### Wire model (`timeline/core/`)

Closed normalized shape (closed-list rule — the six sources are enumerable today; fan-out mechanics are timeline-owned; revisit as a slot only if a non-debug plugin ever needs to feed it):

```ts
type TimelineSource = "trace" | "slow-op" | "report" | "build" | "boot" | "health";
interface TimelineEvent {
  id: string; source: TimelineSource; worktree: string;
  startMs: number; endMs: number;            // wall-clock epoch ms — the ONLY clock on the wire
  label: string; severity: "info" | "warning" | "error";
  traceId?: string;                          // deep-link → traceDetailPane
  detail: Record<string, unknown>;
}
```

All conversion to wall-clock happens server-side at extraction. Source mappings:

| Source | Access | Mapping |
|---|---|---|
| `traces` | DB fan-out | interval `[parse(wallTime) − windowSpanMs, parse(wallTime)]`, `traceId = id` |
| `slow_ops.recentSamples` | DB fan-out | each `{atTime,durationMs,snapshot,traceId?}` → interval `[atTime−durationMs, atTime]` |
| `reports` | DB fan-out | point at `lastSeenAt`; `traceId` from `data->>'traceId'` |
| `build_runs` | DB fan-out, filter `namespace = <that db's worktree>` (skip fork-inherited rows) | interval `[startedAt, finishedAt ?? now]`; open-ended if in-flight; error if `exitCode != 0` |
| boot.jsonl | disk scan | interval per boot line |
| health.jsonl + health-host.jsonl | disk scan | NOT events — downsampled series (≤ ~500 pts/worktree) rendered as a per-lane event-loop-p99 heat strip |

### Endpoint

`GET /api/debug/timeline?fromMs=&toMs=` — **NDJSON**, pull-only, Refresh-button only. Frames: `{total}` → `{chunk:{source,worktree,ok:true,events}}` / `{chunk:{…,ok:false,error}}` → `{health:{worktree,samples}}` → `{end:true}`. One broken fork = one error row, never a blank view.

Server: one module per source under `timeline/server/internal/sources/`, shared fan-out runner (`openShortLivedClient` + `createSemaphore(6)` + per-DB try/catch), DB list from a **newly exported** `listLiveForkDatabases()` (rename-export of the internal `relevantDatabases` from the slow-ops `cluster` server barrel). **Set `statement_timeout` ≈ 10 s per short-lived client** — this view gets opened *during* incidents; a saturated fork must error-row, not hang. Whole handler under `runInBackgroundLane(() => runWithoutProfiling(...))`. No new tables; no retention (each source keeps its own; UI hints lookback limits, e.g. "health ≈ 2 days").

### Web

`SlowEvents.View({ title: "Timeline", component: TimelineView })`. Lookback presets (15 m/1 h/6 h/24 h/custom) + Refresh + progressive fill ("scanning X/N", cluster-tab shape, `readNdjson`). Wall-clock→pixel mapping over `GanttContainer` (`totalMs = toMs − fromMs`); per-worktree lanes (host lane on top); `MultiSpanLane` where it fits, small rows composing css primitives elsewhere. **Incident bands**: export `groupIncidents`/`IncidentInfo`/`incidentColorClass` from the trace `pane` web barrel and run the sweep-union across ALL interval events across worktrees — cross-worktree correlation falls out for free. Click → detail strip; `traceId` deep-links `traceDetailPane`. Pure merge/normalize/downsample logic gets co-located bun tests.

### Tasks

| # | Task | Depends | Parallel |
|---|---|---|---|
| A1 | `boot-events` plugin (writer + rotation + reader) | — | ∥ A2 |
| A2 | Exports: `groupIncidents`+helpers (trace pane web barrel); `listLiveForkDatabases()` (slow-ops cluster server barrel) | — | ∥ A1 |
| A3 | `timeline` core + shared + server (6 sources, fan-out runner, NDJSON endpoint) + bun tests | A1, A2 | — |
| A4 | `timeline` web (tab, axis, lanes, incident bands, heat strip, detail) | A3 schemas | partially ∥ A3 |

### Verification

1. **Acceptance: the 2026-07-10 09:03–09:21Z burst renders from historical data** (471 s `/agents` slow-op, its trace, deploy boot bars, elevated health heat, one incident band across lanes). Must run before health JSONL rotates (~2 days).
2. Synthetic: `POST /api/debug/trace/test-trigger` on two worktrees within 10 s → one incident band spanning both lanes.
3. Break one fork's DB → error row, rest intact.
4. `bun test plugins/debug/plugins/timeline`.

---

## Phase B — Onset sentinel + blind-spot instrumentation

**Homes**: new `plugins/debug/plugins/sentinel/` (sampler + `cluster` ring class + detector + `cluster-onset` trigger + `fleet-flights` enrich class + web lanes); flight-window endpoint added to `debug/plugins/profiling/plugins/runtime`; B0 fix in trace `engine`; worktree stall arming in `health-monitor`; duress latch in new `plugins/infra/plugins/duress/` (cross-cutting primitive; depends only on paths/config_v2).

### B0 — engine fix: enrich may skip

In `assembleEvents` after `raw = await spec.enrich(...)`: `if (raw === undefined) continue;` (mirrors `captureAtTrip`'s undefined-skip). Without it an enrich-only class files a spurious validation-error report on every trace. Bun test + engine CLAUDE.md note.

### B1/B3 — sentinel sampler (main-only, always-on, cadence 5 s)

`setInterval` with the documented health-monitor exception justification (process-sampler.ts:25-32 comment structure: it is the instrument FOR the congestion that would starve a queue job). Started `onReady` gated `isMain()`; torn down `onShutdown`. Per tick, under background lane + `runWithoutProfiling`:

1. Host vitals: `os.loadavg()`, cpu count, swap (reuse host-sampler source).
2. `getContentionSnapshot()` (≤1 s memo): pg active/total backends, top DBs.
3. **NEW pg-side sampling** (one batched round-trip on main's pool; views are cluster-global): active-backend `wait_event_type` counts (`pg_stat_activity`), `pg_locks WHERE NOT granted` count, per-tick deltas of `sum(blk_read_time)`/`sum(xact_commit)` (`pg_stat_database`).
4. Fleet state: `GET /gateway/worktrees` (gateway-served, wakes nothing) → running backends + activeConns; one `ps` via `captureProcessTree()` → in-flight build/check counts. (Flock-slot probing rejected: testing a flock steals the slot.)
5. Every 3rd tick: per-worktree health rollup (tail line of recently-modified `health.jsonl`s).

Emit into `defineTraceEventClass({ id: "cluster", schema, ring: { max: 720 } })` (1 h @ 5 s) with `wall: Date.now()` in each sample — **every main trace automatically gains a cluster-vitals lane**. Config via `defineConfig` (traceConfig template): `enabled`, `cadenceMs`, detector thresholds. Web `Trace.Lane` for `cluster` (generic fallback fine until it lands).

### B2/B4 — onset detector + duress latch

Pure bun-tested `detector.ts`, one sample per tick. **Trip** when ANY signal elevated for `onTicks` (3 ≈ 15 s): `loadAvg1/cpuCount ≥ 1.5` | `locksWaiting ≥ 5` | `blkReadTimeDeltaMs ≥ 2000` | `≥ N` backends with rollup p99 over threshold. **Clear** when ALL below ~60 % of trip thresholds for `offTicks` (6 ≈ 30 s). All knobs config-editable — defaults are educated guesses to be **calibrated against the replayed 09:03–09:21Z burst on the Phase A timeline**.

On trip: `captureTrace({ kind: "cluster-onset", critical: true, durationMs: run-up + 60 s, … })` — `critical` bypasses the per-minute cap; widened `durationMs` widens the persisted window so the cluster ring shows the prologue. On trip/clear: set/clear the **duress latch**.

Latch (`infra/plugins/duress`): file `~/.singularity/duress.latch` (`{setAt, reason}`). Writer (sentinel): create on trip, **refresh mtime every tick while tripped**, unlink on clear. Readers (every backend): `isUnderDuress()` = `statSync` + ~2 s in-process memo; duress holds only while mtime **fresh (< 60 s)** — a crashed main can never wedge the fleet into permanent shedding.

### B3b — fleet flight windows at enrich

New `GET /api/debug/profiling/flight-window?windowMs=` on profiling/runtime returning `captureFlightWindow({maxOpen:100, maxCompleted:200})` + a `wallAnchor: {atMs, wallTime}` for wall-clock conversion. New `defineTraceEventClass({ id: "fleet-flights", enrich })` in sentinel: enrich returns `undefined` unless `trigger.kind === "cluster-onset"` (hence B0); when it runs: `/gateway/worktrees` → **filter `state === "running"`** (mandatory — anything else spawns every dormant backend mid-incident), skip self (in-process read), gateway-mediated fetch with `createSemaphore(4)` + **2–3 s AbortSignal per backend** (a wedged backend yields `{ok:false,error:"timeout"}`, never a stalled enrich). Section: `Record<worktree, {ok:true,window}|{ok:false,error}>`.

### B5 — worktree stall traces (arm-on-elevated)

Remove the `isMain()` gate on the JSC stall profiler in health-monitor, but **arm-on-elevated** (one-way per-process latch — `bun:jsc` has no stop): a worktree backend arms when its own tick sees `eventLoopP99Ms > 200` or `eventLoopMaxMs > 1000`, then drains/fires `stall` traces like main. Main stays always-armed. Trade: the first stall of a previously-healthy backend is missed; stalls under sustained congestion recur. **Overhead must be measured** (~230 Hz native-thread stack walk; expected low single-digit % of a core per armed process — if > ~2 %, revisit thresholds).

### Tasks

| # | Task | Depends | Parallel |
|---|---|---|---|
| B0 | Engine enrich-skip fix + test + CLAUDE.md | — | ∥ |
| B1 | Flight-window endpoint (profiling/runtime) | — | ∥ |
| B2 | `infra/duress` latch (set/clear/refresh/isUnderDuress + freshness; tests) | — | ∥ |
| B3 | `sentinel` sampler + `cluster` ring class + config + web lane | — | ∥ (biggest) |
| B4 | Detector (pure, tested) + `cluster-onset` trigger + latch wiring | B2, B3 | — |
| B5 | `fleet-flights` enrich class + web lane | B0, B1, B3 | ∥ B4 |
| B6 | Worktree stall arming + overhead measurement | — | ∥ |

### Verification

1. `test-trigger` on main → trace Gantt shows the populated `cluster` lane.
2. End-to-end onset: synthetic load (live-state-churn `emit` high push rate + a controlled 3–4-worktree build burst; optionally `benchmark_boot`) → exactly one `cluster-onset` trace per episode, widened window showing the run-up, `fleet-flights` populated **only for running backends** (assert `/gateway/worktrees` states unchanged — nothing woken).
3. Latch lifecycle incl. kill-main-mid-duress → other backends observe lapse ≤ 60 s.
4. Block a worktree backend's loop synchronously → it files a `stall` trace; before/after health samples give the overhead number.
5. `bun test plugins/debug/plugins/sentinel plugins/infra/plugins/duress`.

---

## Phase C — Incident-aware shedding + self-attribution

### C1 — shed engine (in `infra/plugins/duress`)

`createShedBuffer<T>({ kind, cascadeKeyOf, replay })` — **consumers construct the buffer and supply `replay`** (duress never imports reports/slow-ops/trace: no cycle). Per duress **episode** (latch `setAt`):

- `admit(item)`: first **N per cascade key** (`persistFirstN`, default 3) → `{persist:true}` through the normal durable path; past N → buffered in memory.
- Cascade keys: traces `kind:label` (the admission key); slow-ops `operationKind:operation` (the upsert key); reports fingerprint.
- Bounds: `bufferMaxEntries` 2000 + ~4 MB byte soft cap; on overflow **drop newest** (first-N already captured the onset) and increment per-cascade `droppedCount` (drop accounting survives the drop).
- Crash-loss (user-accepted): first-N durable; buffered tail memory-only.
- Flush: lazily checked on `admit` + a one-shot `setTimeout(flushDelayMs, 30 s)` armed by the first call observing the latch cleared. Replay in bounded chunks under background lane + `runWithoutProfiling`, then one **`duress-shed` summary report** per buffer ("episode X: cascade K shed M + dropped D").
- Config on `duress`: `enabled`, `persistFirstN`, `bufferMaxEntries`, `bufferMaxBytes`, `flushDelayMs`. Pure logic bun-tested.

### C2 — choke-point wiring (three edits)

- `captureTrace` (engine capture.ts, beside `cfg.enabled`): under duress past first-N → **skip capture entirely**, buffer only the trigger stub; `critical` bypasses (the onset trace must always land). Stubs fold into the shed summary — no fake replayed traces (a trace's value is its coherent instant, which is gone).
- `recordSlowOp` (record-slow-op.ts:125): buffer full input; replay re-calls it — `onConflictDoUpdate` merge keeps counts/totals truthful, order-insensitive.
- `recordReport` (record-report.ts:59, post-validation): buffer input; replay re-calls — fingerprint upsert dedupes.
- Existing velocity/admission limits unchanged (they bound rate always; duress bounds durable writes during an episode).

### C3 — self-attribution

Instrument **`runWithoutProfiling` itself** (runtime-profiler core): everything suppressed is by definition monitoring work — wrap in a `performance.now()` pair, accumulate `{count, totalMs}` module counters, expose `getSelfMeter()`. Zero per-callsite edits; cannot re-feed the profiler. Surface as two new `HealthSample` fields (`monitorOps`, `monitorMs` per-tick deltas; old lines age out via the schema's safeParse-drop pattern) → Debug → Health + the Phase A heat strip. (Bytes not observable at this layer — dropped; count × ms is the diagnostic that matters.)

### Tasks

| # | Task | Depends | Parallel |
|---|---|---|---|
| C1 | Shed engine + `duress-shed` kind + config + tests | B2 | — |
| C2 | Wire three choke points | C1 | — |
| C3 | Self-meter + HealthSample fields + Health pane columns | — | ∥ C1/C2 |

### Verification

1. Force duress (debug endpoint or detector); 50× `test-trigger` one label → exactly `persistFirstN` traces persisted; clear → shed-summary report after `flushDelayMs`.
2. Synthetic slow-op/report storm under duress → first-N immediate; post-flush `slow_ops.count` equals the full storm; report counts correct.
3. Overflow: cap 10, storm 100 → `droppedCount` 90 in summary.
4. `monitorOps`/`monitorMs` spike during the storm on the Health pane, fall after.
5. `bun test plugins/infra/plugins/duress`.

---

## Open questions (carried, non-blocking)

1. **Detector thresholds** are educated guesses — calibrate against the replayed 09:03–09:21Z burst once the Phase A timeline renders it.
2. **Worktree stall-profiler overhead** — measure in B6; revisit arming thresholds if > ~2 % core.
3. **`pg_stat_activity` wait_event granularity through PgBouncer** — eyeball first sentinel samples; fallback is the admin pool (one-line change).
4. **Gateway-events timeline source** (spawn/restart/idle-sweep — the one lane that sees a backend that never reached `onReady`) — descoped with the Go work; natural v2 source.

## Related docs

- Track state + burst evidence: [`research/perfs/CLAUDE.md`](./perfs/CLAUDE.md), [`research/perfs/2026-07-08-host-saturation-agent-checks-starve-main.md`](./perfs/2026-07-08-host-saturation-agent-checks-starve-main.md)
- Lane/gating discipline: `research/2026-07-09-global-interactive-lane-under-load.md`
- Anti-amplification reasons recorded in code: trace `engine/server/index.ts:28-38`, `record-slow-op.ts:149-172`, `record-report.ts:102-122`
