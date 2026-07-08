---
name: debug
description: >
  Map of the debugging surfaces (logs, profiling, crashes, DB, queue, ...)
  available to find a bug in Singularity. Read BEFORE debugging anything.
---

# Debugging Surfaces

High-level map of where to look. Open the linked `CLAUDE.md` for details.

## Logs
Browser + server log lines persisted per worktree to `~/.singularity/worktrees/<wt>/logs/<channel>.jsonl` (survives restarts). Emit from browser via `clientLog(channel, line)`; `tail`/`cat` the file to read.
→ [`plugins/debug/plugins/logs/CLAUDE.md`](../../../plugins/debug/plugins/logs/CLAUDE.md)

## Live-state sync (UI stale / "not updating until refresh")
When a server change doesn't reach an already-open tab until refresh, the bug is in the client live-state pipeline (WS → cross-tab leader election → BroadcastChannel → query cache), not the server. `NotificationsClient` traces every hop **and every silent drop** to the `live-state` log channel (`[tabId]`-stamped, over plain HTTP so it survives a wedged WS) — `cat logs/live-state.jsonl` and the gap localizes the dead hop. The **Debug → Live State** pane shows live socket/leader/per-resource-version state; a watchdog toasts + files a `live-state-wedge` crash when the pipeline stalls.
→ [`plugins/primitives/plugins/live-state/CLAUDE.md`](../../../plugins/primitives/plugins/live-state/CLAUDE.md)

## Re-render loops (which component/hook is the initiator)
The always-on DOM render-loop detector (`plugins/reports/plugins/render-loop`) flags THAT/WHERE a subtree thrashes; the on-demand **React fiber-commit profiler** names the INITIATING component + hook. OFF by default (it walks the committed fiber tree per commit, gated behind an explicit Start). On each commit it finds the topmost `PerformedWork`-flagged component along each path (re-rendered on its OWN state/context/store, not propagation) and diffs the hook `memoizedState` list against the fiber's `alternate` to name the offending hook — especially `useSyncExternalStore` (where live-state's `useResource` / TanStack `useQuery` lands). It also splits each initiator into **mount vs update** counts and reports a ranked **remounts** list (destroy-and-rebuild positions) with the likely structural cause (`element-type` flip e.g. `Fragment→div`, or `key-change`) — so a churn bug names its cause instead of needing hand-rolled `MutationObserver` probes. Open **Debug → Render Profiler**, or run headless: `bun e2e/render-profile.mjs --url http://<wt>.localhost:9000/<route> --seconds 8`. The ranked report dumps to the `render-profiler` JSONL channel on stop (`cat logs/render-profiler.jsonl`); imperative API is `window.__reactRenderProfiler.{start,stop,getReport,isRunning}`.
→ [`plugins/debug/plugins/render-profiler/CLAUDE.md`](../../../plugins/debug/plugins/render-profiler/CLAUDE.md)

## Profiling (Gantt)
Build steps, server boot phases, push contention, runtime HTTP/DB/loader, and stats timings. Use to find *slow*, not just *broken*. The **Boot** Gantt also shows **per-phase phys_footprint deltas + a phase-boundary memory timeline** (boot-start → after-import → after-onReadyBlocking → after-onReady → after-onAllReady) — use it to see which boot phase grows memory. (These report the real macOS `phys_footprint`, not `rss` — see the Memory section below.) Caveat: onReadyBlocking/onReady plugins run under `Promise.all`, so per-plugin deltas overlap and are only *directional* (the longest-running span absorbs blame for whatever allocates concurrently); the phase-boundary checkpoints are authoritative.
→ [`plugins/debug/plugins/profiling/CLAUDE.md`](../../../plugins/debug/plugins/profiling/CLAUDE.md)

## Boot Profile (browser request → first paint)
For "why is the page slow to first paint": the **Debug → Boot Profile** pane renders the real browser boot as a Gantt from the `boot-trace` client store — `navigation` (Navigation Timing, decomposed across 0→TTFB), `scripts` (module eval + plugin load + createRoot), `main-thread` (Long Tasks ≥50ms — the bundle parse/compile + plugin-chunk fan-out + first React render that fills the pre-instrumentation 0→first-span blind spot), `assets` / `resources` (wait vs work split), and `paint` (FP/FCP/first React commit). A **boot cost** summary strip surfaces JS shipped + chunk count, biggest chunk, and main-thread-busy-before-paint. Trace is the current tab's boot (ephemeral); **Reload & re-measure** re-runs it. This is the runtime-*timeline* view; pair it with the Bundle size entry below for the static-*bytes* view.
→ [`plugins/debug/plugins/boot-profile/CLAUDE.md`](../../../plugins/debug/plugins/boot-profile/CLAUDE.md)

## Bundle size (eager boot bytes)
For "why is first paint slow / what's in the 2.9 MB entry bundle": the boot cost is dominated by the **eager set** (entry chunk + its static-import chunks — the `<script>`/`modulepreload` list in `dist/index.html`). `VITE_ANALYZE=1 bunx vite build` (in `web-core`) writes `web/dist.stats.html`, a treemap of every chunk's contents with gzip/brotli sizes — the static-bytes counterpart to the **Debug → Boot Profile** request→first-paint timeline. Caveat already paid for once: do **not** lump a partially-lazy heavy lib (react-icons, shiki, markdown) into one `manualChunks` group — it unions lazy code onto the boot path (measured 715 KB → 2.4 MB gzip).
→ [`plugins/framework/plugins/web-core/CLAUDE.md`](../../../plugins/framework/plugins/web-core/CLAUDE.md) (Bundle analysis)

## Memory (heap / footprint)
For "why is this backend using N GB":
- **Debug → Heap pane** (`heap-snapshot`) — `bun:jsc heapStats()` object-type breakdown (count per JS type, heap size) plus the real **phys_footprint**, for a cheap "what's on the JS heap vs. total real memory" read; plus an on-demand **full V8 `.heapsnapshot` dump** to `~/.singularity/worktrees/<wt>/heap-<ts>.heapsnapshot` (load offline in Chrome DevTools → Memory, or VS Code). The dump is heavy (blocks the event loop for seconds, hundreds of MB) — manual click only.
- **All memory surfaces report `phys_footprint`, not `rss`.** The boot checkpoints, the Heap pane, and the **health-monitor** sampler now surface the real macOS `phys_footprint` (the metric Activity Monitor / memory-pressure use), obtained via FFI `proc_pid_rusage` (`physFootprintBytes()` in `server-core/core`). `rss` is intentionally **not** shown: `process.memoryUsage().rss` overcounts ~6× on macOS — a backend reading 5+ GB `rss` was measured at **~885 MB true `phys_footprint`** — because it counts resident-but-clean/reserved/shared pages (JSC WebKit-Malloc reservations, the 65 GB virtual JS Gigacage, IOAccelerator/GPU regions). The heap-vs-footprint gap is the first discriminator: small `heapStats` heap but large footprint ⇒ the cost is off-heap/native (JIT code region, pg buffers), not JS objects. File-watchers (@parcel/watcher) are *not* a memory cost — subscribing even to a huge `.git` allocates ~0 MB.
- **`IOAccelerator` (Metal/GPU) dirty memory is NOT GPU work.** If `vmmap -summary <pid>` shows a backend holding hundreds of MB of `IOAccelerator` *dirty* memory, that is JSC's executable **code region** on Apple Silicon (rwx JIT/bytecode arenas surface under the IOAccelerator vmmap tag), not image/GPU compute. It scales with the **volume of distinct JS modules compiled**, not with compute or requests: idle ~13 MB, a full app backend ~600–860 MB after compiling the 100+ plugin module graph; it's **bounded** (plateaus, code GC evicts cold code). JIT flags (`JSC_useFTLJIT/useDFGJIT/useJIT=false`) do **not** reduce it. Treat the ~600–860 MB as a known per-backend baseline, not a leak. (An always-on health-pane metric was evaluated and deliberately *not* shipped — `vmmap` suspends the process ~0.58s/sample, not worth it for a benign bounded number; measure on demand instead.) See `research/2026-06-18-global-backend-gpu-ioaccelerator-memory.md`.
→ [`plugins/debug/plugins/heap-snapshot/CLAUDE.md`](../../../plugins/debug/plugins/heap-snapshot/CLAUDE.md)

## Slow / intermittent contention
For "why is X slow" (especially bursty/contention slowness), beyond the Gantt:
- **`get_runtime_profile` MCP tool** — slowest HTTP / DB / loader spans with per-parent (`byParent`) attribution and a per-call wall-clock decomposition on **every** entry (composite `flush`/`push` included): `waitMs` names the gate/pool layers the span's subtree queued on (an interval union, ≤ wall at every level), `childMs` covers direct-child entries, `selfMs` is its own work. Mostly-`waitMs` = head-of-line-blocked victim; mostly-`selfMs` = genuinely slow. Pass `worktree` for another namespace (`"singularity"` = main).
- **"Now" vs "old peak"** — the profiler's `recentMaxMs` (rolling ~5-min window) answers "is it slow *right now*"; `maxMs` is the since-boot peak and carries `maxAgeMs`, so an old spike visibly reads as old. For history that survives restarts, the durable **`slow_ops` table** (`query_db`) has real `last_seen_at` / `last_ms`; also surfaced as the **Aggregates** tab of **Debug → Slow Events**.
- **Debug → Slow Events pane** (`/debug/traces`) — per-incident **evidence**, not aggregates. When a span crosses its slow threshold (or an op-time budget breaks, or a slow client signal lands), the trace engine persists ONE coherent-instant **trace**: the trip + everything concurrently in flight (`spans`), every concurrency gate's occupancy (`gates`), and the host/DB `contention` — rendered as a unified **Gantt** for the blocking-chain walk (which gate saturated, who held it). Durable (7-day TTL), rate-limited, hydrate-on-open. A `slow-op` / `op-time` **report links to its trace** via a `traceId` in the report `data` (a *View trace* chip on the KindView) — start at the alert, jump to the evidence. The pane also hosts the Aggregates + Cluster tabs (the old Slow Ops surface). This is the evidence store; **`reports` stays the alert funnel** (bell, dedupe, tasks).
- **op-time reports = count×cost** — beyond per-call latency (`slow-op`) and call count (`op-rate`), the op-rate monitor also trips on **aggregate wall-clock per op per 5-min window** (Σms), catching a flood of individually-fast calls that together burn a budget. An `op-time` report carries `msInWindow` / `callsInWindow` (the rate×cost decomposition) and, for per-op trips, a linked trace of what was in flight while the op burned time.
- **`pg_stat_activity`** (`query_db`) grouped by `datname` + `wait_event` — cluster-wide backend / lock picture across all worktrees on the shared Postgres. A query that's slow under load but fast under `EXPLAIN ANALYZE` in isolation is **contention**, not a bad plan.
- **Debug → Health pane** (`health-monitor`) — continuous per-backend time series of **event-loop lag** (p99/max — the headline signal for GC/blocking stalls), **phys_footprint/heap**, and **heap growth**, plus a main-only host strip (load / free-mem / swap). Samples append to `logs/health.jsonl` per worktree and the pane reads them **from disk**, so it works even when a backend is wedged (unlike `get_runtime_profile`, which 404s on an unhealthy backend). Use it to tell a **per-backend** stall (event-loop max spikes, footprint balloon) apart from **host** pressure (load/swap). `cat logs/health.jsonl` for the raw forensic record.
→ [`plugins/debug/plugins/health-monitor/CLAUDE.md`](../../../plugins/debug/plugins/health-monitor/CLAUDE.md) · trace engine + Slow Events Gantt [`plugins/debug/plugins/trace/CLAUDE.md`](../../../plugins/debug/plugins/trace/CLAUDE.md)

## Crashes
Uncaught browser/server errors recorded + deduped into tasks; handled 4xx/5xx and mutation errors also file crash tasks. The Debug pane lists all crashes (including noise).
→ core [`plugins/crashes/CLAUDE.md`](../../../plugins/crashes/CLAUDE.md) · pane [`plugins/debug/plugins/crashes/CLAUDE.md`](../../../plugins/debug/plugins/crashes/CLAUDE.md)

## Query the DB
`query_db` MCP tool — read-only SQL against the worktree DB (pass `database` for another worktree or `"singularity"` for main). Mutations rejected.
→ [`plugins/database/plugins/query/CLAUDE.md`](../../../plugins/database/plugins/query/CLAUDE.md)

## Jobs / Events / Triggers
Queue debug pane — inspect the jobs queue, events emission log, and active triggers.
→ [`plugins/debug/plugins/queue/CLAUDE.md`](../../../plugins/debug/plugins/queue/CLAUDE.md)

## Claude CLI calls
Every single-shot `claude --print` (Haiku/Sonnet/Opus) with prompt, output, source, duration.
→ [`plugins/debug/plugins/claude-cli-calls/CLAUDE.md`](../../../plugins/debug/plugins/claude-cli-calls/CLAUDE.md)

## Other debug panes
Memory browser, broadcasts editor, worktree cleanup — under [`plugins/debug/plugins/`](../../../plugins/debug).

## Verify behavior in the real app
Scripted Playwright helper — clicks, before/after screenshots, reports control state. Prefer this over blind static screenshots.
→ [`e2e/screenshot.mjs`](../../../e2e/screenshot.mjs)

---
If something was missing from this skill, report it (`add_task` or tell the user) so it gets added.
