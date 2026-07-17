# sentinel

The **cluster congestion sentinel** (plans:
`research/2026-07-10-global-congestion-observability.md` Phase B;
`research/2026-07-11-global-observability-freeze-blind-spots.md` Stages 3+5;
`research/2026-07-11-global-fleet-memory-admission-duress-valve.md` Piece 2).
A main-only, always-on sampler that gives the observability stack what no
per-backend monitor can: the *cluster-wide* vitals at every instant, recorded
continuously so congestion onset is captured **prospectively**, not
reconstructed from the first victim's threshold trip.

## Architecture: everything critical lives on a worker thread (Stage 5)

During the 2026-07-11 03:29 freeze the duress latch **cleared mid-thrash**:
sampling and lease renewal rode main's own event loop, and a blocked loop
cannot renew a 60 s lease. So the sampler, the onset detector, AND the whole
latch lifecycle run on a dedicated Bun `Worker` (`server/internal/worker/`),
whose thread keeps ticking while main is wedged. **The worker is the single
latch owner** — no `setDuress/refreshDuress/clearDuress` call exists on main.

- `worker/entry.ts` — the worker: `setInterval(cadenceMs)` tick, the pure
  detector, latch set/refresh/clear, duress-episode lines, max-episode-hold.
  Lean closure: the `duress/plugins/latch` leaf barrel, log-channels, the
  embedded-pg constants, pure detector/gatherers. No config_v2 (thresholds
  arrive as frames — a worker has no plugin runtime).
- `worker/pg.ts` — ONE dedicated raw `pg` client on the embedded cluster's
  direct Unix socket (no drizzle pool, no PgBouncer): sharing main's pool
  would re-couple the sentinel to the contention it measures. On error: null
  pg fields, one in-tick reconnect attempt, a log frame.
- `worker/sample.ts` — the impure gatherers (gateway fleet fetch, `ps` scan,
  health.jsonl p99 rollup, health-host.jsonl compressor tail). Per-signal
  degradation: every sub-read fails into null fields + a log line, never the
  tick.
- `worker-host.ts` (main) — spawns/supervises the worker: respawn with capped
  backoff (a respawned worker **adopts a fresh existing latch** at init and
  keeps refreshing), a rapid-failure give-up (5 immediate deaths → one loud
  line, no respawn loop), live `watchConfig` threshold push, graceful stop
  (worker clears the latch, acks, then terminate).
- `sampler.ts` / `onset.ts` (main) — **best-effort re-emitters only**: sample
  frames → `cluster` trace ring + `onSentinelSample` listeners; trip frames →
  `captureTrace({kind:"cluster-onset", critical: true})`; log frames → the
  `sentinel` channel. Nothing main-side is on the latch's critical path.

If main's whole process dies the worker dies with it and the lease lapses
within 60 s — the fleet self-recovers (unchanged fail-safe). The worker's
`setInterval` is the sentinel's documented exception to the no-polling rule
(the diagnostic instrument FOR cluster duress cannot ride the job queue that
the congestion it measures saturates).

**Compiled releases** (verified on Bun 1.3.13): `bun build --compile` does NOT
trace/embed `new Worker(new URL(...))`, so the worker is **vendored** instead —
`release.ts` bundles `worker/entry.ts` to a standalone `<out>/sentinel/worker.js`
(its lean closure inlines), `launch.ts` points `SINGULARITY_SENTINEL_WORKER_JS`
at it, and `worker-host.ts` spawns from that path when the env is set (else the
dev source URL). This mirrors the vendored parcel-watcher native addon. The
start-gate also admits releases: a release's single backend runs under the
composition name (so `isMain()` is false), so `sentinel/server/index.ts` starts
when `isMain() || isRelease()` — a release runs exactly one backend, so it stays
the host singleton. See `research/sentinel-worker-in-compiled-release.md`.

## Each tick gathers

- **Host**: loadavg / cpu count, plus a `health-host.jsonl` tail line (30 s
  freshness guard; a `wallJumpMs`-stamped line reads null) for
  `decompressionsPerSec` / `compressorMb` / `freeMemMb` — the compressor
  memory signal (no second `vm_stat` spawn; the 10 s host sampler owns that).
- **Pg cluster**: ONE batched query on the dedicated client — active-backend
  `wait_event_type` counts, ungranted `pg_locks`, per-tick deltas of
  `sum(blk_read_time)` / `sum(xact_commit)`, and the cluster backend counts
  (contention's `datname IS NOT NULL` semantics).
- **Fleet**: `GET /gateway/worktrees` (gateway-served — wakes nothing) for
  running-backend count + active conns; one `ps -axo command=` spawn counting
  in-flight `singularity build/check/push` processes.
- **Backends**: every 3rd tick, a health.jsonl tail scan (fresh-mtime files
  only) → `backendP99` rollup per live backend.

Every sample is mirrored to main as a frame: `clusterClass.emit(...)` into the
**`cluster` trace ring** (`ring: { max: 720 }` ≈ 1 h) — the engine persists
the slice overlapping ANY trace's window, so every trace captured on main
carries a cluster-vitals lane for free — and the `onSentinelSample` listener
registry. postMessage buffers while main is wedged; samples carry their own
`wall`, so late delivery is harmless.

## Host-metric ownership (loadavg not shared)

The compressor/swap/freeMem signals are **single-sourced** from health-monitor's
persisted `health-host` file (`worker/sample.ts` tail-reads it under a 30 s
freshness guard — no second `vm_stat` spawn). **loadavg is not.** The worker
re-runs its own `os.loadavg()` syscall each tick rather than reading that
10 s-cadence file: a free syscall must not become a stale file read on the
latch-critical thread, since trip timing depends on it (the worker's isolation
premise). So loadavg is deliberately sampled in both the worker and
health-monitor's host sampler; only the expensive vm_stat read is deduped. See
`health-monitor`'s CLAUDE.md ("Host-metric ownership") for the owning half.

## The onset detector + duress latch (B4)

`server/internal/detector.ts` is the pure state machine (dual-threshold,
dual-dwell hysteresis; one trip event per episode; a null reading — blk-read
delta, pg-down locks, stale compressor line — is neither elevated nor
calm-blocking). Signals: load ratio, pg locks, blk-read delta, slow backends,
and `decompressionsPerSec ≥ onDecompressionsPerSec` (default 50 k/s — the
07-11 freezes ran 240k–442k/s; same latch, same hysteresis machinery, no new
mechanism). The worker feeds it per tick: on **trip**, `setDuress(reason)` +
a trip frame (main mirrors it into `captureTrace`); **every tripped tick**,
`refreshDuress()`; on **clear**, `clearDuress()` + a clear frame. Phase C's
shedding gates on that latch. **Max-episode-hold** (config, default 30 min)
force-clears and re-evaluates from a fresh detector so a mis-calibrated
threshold cannot latch the fleet indefinitely (the re-trip re-grants shed
first-N — a small persistence burst, accepted).

## Duress episodes channel (Stage 3)

The worker — the latch's sole writer — appends one line per transition to the
persisted **`duress-episodes`** log channel on main's log dir (boot-events
pattern: no DB table, survives re-forks, readable while wedged):
`{ atMs, kind: "trip"|"clear", reason, episodeSetAt }` (zod schema in
`core/episode.ts`). Every line carries `episodeSetAt`, so a clear line alone
fully determines its interval. `readDuressEpisodes(windowMs)` (server barrel)
is the timeline's read contract — bounded tail, safeParse-drop, `atMs`-window
filter. Latch adoption writes no trip line (the previous worker already did);
a lapse-clear has no line (accepted gap).

The deterministic 03:34 reproduction lives in `worker/latch-lapse.test.ts`: a
real Worker trips on injected `__sample` frames, the parent blocks itself with
`Atomics.wait` (no event loop — a wedged main), and the latch mtime must
advance during the block.

## Duress-episode report (WS3)

The report/bell half of the duress signal (the trip instant is already covered by
the `cluster-onset` critical trace + the timeline band). The worker's clear frame
is enriched with `{reason, elevated, episodeSetAt, wall, forced}`; `onset.ts`'s
`handleClearFrame` files **one `duress-episode` report per episode, on clear** via
`recordReport`. Fingerprint is the sorted **cause-signature** (`elevated`), NOT the
episode, so a storm collapses to counted rows. The kind is
**`duressExempt: true`** — it IS the durable record of the condition that drives
shedding, so it must never be shed (a re-trip racing the async record, or buffer
overflow at peak, would lose it — the same bar as `duress-shed`'s own summary
kind). The `boot`/`duress-episodes` channels' report+timeline wiring is enforced by
the `durable-signals-accounted` check.

## Fleet flight windows (B5)

`server/internal/fleet-flights.ts` — an enrich-only event class that reacts to
`cluster-onset` triggers ONLY (undefined-skip on everything else). It fetches
`GET /gateway/worktrees`, filters `state === "running"` (**mandatory** —
proxying to a dormant backend cold-starts it, and spawning the fleet
mid-incident would amplify the incident), skips main itself (its flight window
is already the trace's `spans` section), and fans out to each backend's
`GET /api/debug/profiling/flight-window` under a 4-slot semaphore with a 3 s
per-backend abort — a wedged backend yields an `{ok:false}` cell, never a
stalled enrich. Cell payloads are validated loosely on purpose: fan-outs must
tolerate backends on older/newer profiler code.

## Config

`sentinelConfig` (`core/config.ts`, Settings → Config): `enabled` + `cadenceMs`
(restart to apply — the worker's interval is created at init), the B4 detector
thresholds (`on*`/`off*`, incl. `onDecompressionsPerSec` — live: main watches
the config and pushes threshold frames to the worker), and `maxEpisodeHoldMs`.
Defaults are educated guesses; calibrate against the replayed 2026-07-10
09:03–09:21Z burst and the 2026-07-11 freezes on the Timeline tab.

## Clock discipline

Ring `tMs` is profiler-clock (joins the containing snapshot's Gantt); each
sample carries its own `wall` (Date.now) as the cross-backend anchor.

## Web

Config registration only. The `cluster` section currently renders through the
pane's `GenericEventLane` fallback; a dedicated `Trace.Lane`
(load-ratio/pg/builds sparklines) is a follow-up.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Sentinel web presence: registers the sentinel config (sampler cadence + onset thresholds) for Settings → Config, plus the one-line duress-episode report summary for Debug → Reports. Cluster congestion sentinel: a main-only always-on sampler + onset detector + duress-latch lifecycle on a dedicated worker thread (host load, Postgres-side wait/lock/IO pressure, fleet state, per-backend health rollup, compressor pressure), feeding the 'cluster' trace ring so every trace gains a cluster-vitals lane, congestion onset is observable, and the latch lease survives a wedged main loop. Persists duress episodes as trip/clear lines on the duress-episodes channel (readDuressEpisodes).
- Web:
  - Contributes: `ConfigV2.WebRegister`, `Reports.KindView` → `DuressEpisodeSummary`
  - Uses: `config_v2.ConfigV2`, `primitives/css/badge.Badge`, `primitives/css/inline.Inline`, `reports.Reports`
- Server:
  - Contributes: `trace-event-class` "cluster", `trace-event-class` "fleet-flights", `report-kind` "duress-episode", `ConfigV2.Register` "sentinel"
  - Uses: `config_v2.ConfigV2`, `config_v2.getConfig`, `config_v2.watchConfig`, `database/embedded.PG_PORT`, `database/embedded.PG_SOCKET_DIR`, `database/embedded.PG_USER`, `debug/health-monitor.HealthSample`, `debug/health-monitor.HealthSampleSchema`, `debug/health-monitor.HostSampleSchema`, `debug/trace/engine.captureTrace`, `debug/trace/engine.defineTraceEventClass`, `infra/duress/latch.clearDuress`, `infra/duress/latch.isUnderDuress`, `infra/duress/latch.readDuress`, `infra/duress/latch.refreshDuress`, `infra/duress/latch.setDuress`, `infra/paths.currentWorktreeName`, `infra/paths.isMain`, `infra/paths.isRelease`, `infra/paths.listWorktreeDirs`, `infra/paths.MAIN_WORKTREE_NAME`, `infra/paths.WORKTREES_DIR`, `primitives/log-channels.Log`, `primitives/log-channels.LogChannel`, `primitives/log-channels.readChannelEntries`, `primitives/log-channels.readChannelJson`, `reports.recordReport`, `reports.ReportKind`
  - Exports: Values: `readDuressEpisodes`
- Core:
  - Uses: `config_v2.defineConfig`, `fields/bool/config.boolField`, `fields/float/config.floatField`, `fields/int/config.intField`
  - Exports: Types: `ClusterSample`, `ClusterSection`, `DuressEpisodeEvent`, `DuressEpisodeReportPayload`; Values: `ClusterSampleSchema`, `ClusterSectionSchema`, `DURESS_EPISODES_CHANNEL`, `DuressEpisodeEventSchema`, `DuressEpisodeReportPayloadSchema`, `sentinelConfig`
- Cross-plugin:
  - Imported by: `debug/timeline`

<!-- AUTOGENERATED:END -->
