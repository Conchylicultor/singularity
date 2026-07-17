# timeline

The **unified cross-worktree slow-event timeline** (plan:
`research/2026-07-10-global-congestion-observability.md`, Phase A). Today an
incident is reconstructed by hand across five stores; this plugin builds the
merge: one endpoint fans out over every live worktree DB fork **and** the
per-worktree disk logs, normalizes everything to a single wall-clock wire
model, and streams it back as NDJSON. The web tab (Debug → Slow Events →
Timeline) renders it as per-worktree lanes.

## Wire model (`core/`)

`TimelineEvent { id, source, worktree, startMs, endMs, label, severity,
traceId?, detail }` — **wall-clock epoch ms is the ONLY clock on the wire**.
Profiler-clock values are incomparable across backends (trace-engine clock
discipline), so every source converts at extraction; durations transfer
as-is. The seven sources are a **closed list** (closed-list rule — fan-out
mechanics are timeline-owned; revisit as a slot only if a non-debug plugin
ever needs to feed it):

| Source | Access | Interval |
|---|---|---|
| `trace` | DB fan-out | `[wallTime − (atMs − windowStartMs), wallTime]`; critical trigger → error |
| `slow-op` | DB fan-out | each `recentSamples` entry → `[atTime − durationMs, atTime]`; ≥5× threshold → error |
| `report` | DB fan-out | point at `lastSeenAt`; crash-like kind → error, noise → info |
| `build` | DB fan-out | `[startedAt, finishedAt]`; in-flight → open-ended to `toMs` + `detail.inFlight`; exit ≠ 0 → error |
| `boot` | disk (boot-events) | `[processStartedAt, readyAt]` per boot; never-ready → bounded by the next attempt (warning) or open-ended to `toMs` + `detail.inFlight` |
| `duress` | disk (sentinel duress-episodes, main only) | `[episodeSetAt, clearAtMs]` per episode; no clear line → open-ended to `toMs` (recent) or bounded at trip + 30 min / the next episode with `detail.endUnknown` (lapsed). Host-global: renders as a cross-lane warning band + badge row, not a lane |
| `health` | disk (health JSONL) | NOT events — downsampled series frames (≤500 pts/lane, bucket-max on p99 / the host pressure score), host vitals on the `"host"` lane |

**Host-lane pressure score** (`shared/pressure.ts`): one shared
`hostPressureScore` — max of the loadAvg1/cpuCount ramp and the macOS
memory-compressor decompressions/sec ramp (mild ≥ 20k/s, strong ≥ 100k/s,
error ≥ 250k/s; calibratable, from the 2026-07-11 freeze forensics) — is both
the server's downsample `valueOf` AND the web heat-strip severity, so the
points that survive downsampling are exactly the points the strip colors
worst. A compressor-thrash freeze (swap ≈ 0, decompressions 240k–442k/s) now
renders error heat instead of "memory pressure ≈ 0".

**Dark segments** (`web/internal/heat.ts`): a point's heat half-span is capped
at 3× the series' median inter-sample gap, and any gap beyond 6× median
renders its uncovered stretch as a hatched **dark** segment — labeled `sleep`
when the gap-ending point carries the sampler's `wallJumpMs` stamp, else
"sampler dark" (wedged, dead, or no history — during a freeze, the honest
answer). Sleep-wake points are force-kept through downsampling (they carry no
severity but classify their gap).

**Duress bands**: a duress episode is the "this window is thinned" marker —
shed slow-ops/reports inside it are expected to be sparse. Its events ride the
stream as one host-lane chunk but render as full-height warning-tinted bands
behind all lanes plus a clickable reason-labeled badge row (never a worktree
lane), and they are excluded from the incident sweep (host-global spans would
chain everything they overlap into one mega-incident). An episode with no
clear line either renders open-ended (its provable bound — trip +
`MAX_OPEN_EPISODE_MS`, mirroring the sentinel's max-episode-hold default, or
the next episode's trip — lies past the window edge) or bounded with
`endUnknown` (a lease lapse writes no line; the accepted Stage 3 gap, never
still-open forever).

## Endpoint

`GET /api/debug/timeline?fromMs=&toMs=` — **NDJSON, pull-only** (Refresh
button; never live, never polled — the anti-amplification rule). Frames
(`shared/frames.ts`, the server↔web contract): `{total}` →
`{chunk:{source,worktree,ok:true,events}|{…,ok:false,error}}` →
`{health:{worktree,samples}}` → `{end:true}`; `{error}` is the
whole-stream-failure auto-frame. One broken fork = one error cell, never a
blank view (cluster-tab pattern).

## Fan-out mechanics (`server/internal/`)

Mirrors the slow-ops **cluster** tab: `listLiveForkDatabases()` →
`openShortLivedClient(db)` under `createSemaphore(6)`, one chunk per
(DB × source) with per-cell try/catch. Two hardenings on top of the
precedent:

- **`SET statement_timeout = 10000` per session** (one held `pool.connect()`
  client per DB visit, so the setting can't be lost to pool recycling): this
  view opens *during* incidents; a saturated fork must error-row, not hang.
- The whole producer runs under
  `runInBackgroundLane(() => runWithoutProfiling(...))` — observability never
  feeds the profiler or rides the interactive lane.

**Fork-inherited rows are scoped out.** A fork DB inherits main's
traces/slow_ops/reports at fork time; without scoping, main's burst would
render once per fork. Fork DBs filter `worktree = <dbName>` (fork DB names
ARE worktree slugs — the identity mapping the cluster tab uses); the main DB
stays unfiltered (it is the authority, and this sidesteps legacy rows with a
fallback worktree value). `build_runs` carries `namespace` instead, and
*every* DB — main included — filters `namespace = <dbName>`, per that
table's own inherited-row convention.

Disk lanes (boot, health) enumerate worktree **log dirs** (health-monitor's
scan), not DBs — readable from main even while a backend is wedged.

**No new tables, no retention, no live resource, no polling.** Each source
keeps its own retention (traces 7d, health JSONL ~days before rotation); the
UI hints lookback limits.

## Tests

Pure logic (interval mapping, overlap, severity, downsampling, in-flight
builds) is co-located `bun:test`:

```bash
bun test plugins/debug/plugins/timeline
```

## Agent access

The **`get_timeline` MCP tool** is the primary agent surface — the web tab's
NDJSON is not practically consumable by an agent, so this tool drives the SAME
`produceTimeline` producer **in-process** (`server/internal/collect.ts`) and
renders the frames as a compact, local-time text report
(`server/internal/render.ts`). Use it — not raw jsonl logs — to reconstruct a
slowness/freeze/memory-pressure incident across the cluster.

- **Backend-independent, so no `worktree` arg** (a named deviation from the
  `get_queue_health` / `get_runtime_profile` gateway-fetch precedent, whose
  point is reaching *another* backend's live in-memory state; the timeline's
  answer is fork-DB fan-out + shared host filesystem reads, with no other
  backend to reach).
- Window: `lookbackMinutes` (default 30, max 1440) ending now or at `endIso`;
  filter with `minSeverity` / `sources` / `maxEvents`. **Epoch ms is never
  exposed** — all times are local with the tz in the header.
- Report shape: DURESS episodes first (never capped — signal is thinned inside
  them), then host-pressure + backend-health peaks (summarized, never dumped),
  then EVENTS (severity-first retention, re-sorted by wall clock) with
  **explicit per-source drop accounting** and a **CHUNK ERRORS** block so
  missing data never reads as calm.

Raw fallback (epoch-ms NDJSON, the exact stream the web tab reads):

```bash
curl -s 'http://<wt>.localhost:9000/api/debug/timeline?fromMs=…&toMs=…'
```

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Timeline tab for the Slow Events pane: the unified cross-worktree wall-clock Gantt — per-worktree lanes of traces / slow-ops / reports / builds / boots with health heat strips and cross-worktree incident bands, streamed pull-only from the timeline endpoint. Cross-worktree unified timeline endpoint: fans out over every live worktree DB fork (traces, slow-op samples, reports, builds) plus the per-worktree disk logs (boot events, health series), normalizes everything to wall-clock TimelineEvents, and streams them as NDJSON — pull-only, never live or polled.
- Web:
  - Contributes: `SlowEvents.View` "Timeline" → `TimelineView`
  - Uses: `debug/profiling.formatDuration`, `debug/profiling.GanttContainer`, `debug/profiling.MultiSpanLane`, `debug/profiling.useGanttContainerContext`, `debug/trace/pane.groupIncidents`, `debug/trace/pane.IncidentBadge`, `debug/trace/pane.incidentColorClass`, `debug/trace/pane.SlowEvents`, `debug/trace/pane.traceDetailPane`, `infra/endpoints.getEndpointErrorMessage`, `infra/ndjson-stream.readNdjson`, `primitives/css/badge.Badge`, `primitives/css/clip.Clip`, `primitives/css/cluster.Cluster`, `primitives/css/column.Column`, `primitives/css/fill.Fill`, `primitives/css/line.Line`, `primitives/css/overlay.Overlay`, `primitives/css/placeholder.Placeholder`, `primitives/css/scroll.Scroll`, `primitives/css/spacing.Inset`, `primitives/css/spacing.Stack`, `primitives/css/status-dot.StatusDot`, `primitives/css/text.Text`, `primitives/css/toggle-chip.SegmentedControl`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.cn`, `primitives/icon-button.IconButton`, `primitives/pane.useOpenPane`, `primitives/syntax-highlight.HighlightedCode`
- Server:
  - Uses: `database/admin.openShortLivedClient`, `debug/boot-events.readBootEvents`, `debug/health-monitor.HealthSample`, `debug/health-monitor.HealthSampleSchema`, `debug/health-monitor.HostSample`, `debug/health-monitor.HostSampleSchema`, `debug/sentinel.readDuressEpisodes`, `debug/slow-ops/cluster.listLiveForkDatabases`, `infra/mcp.Mcp`, `infra/ndjson-stream.ndjsonResponse`, `infra/paths.listWorktreeDirs`, `infra/paths.MAIN_WORKTREE_NAME`, `primitives/log-channels.readChannelJson`
  - Register: `mcpTool('get_timeline')`
  - Routes: `GET /api/debug/timeline`
- Core:
  - Exports: Types: `TimelineEvent`, `TimelineSeverity`, `TimelineSource`; Values: `TIMELINE_SOURCES`, `TimelineEventSchema`, `TimelineSeveritySchema`, `TimelineSourceSchema`

<!-- AUTOGENERATED:END -->
