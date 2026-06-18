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

## Profiling (Gantt)
Build steps, server boot phases, push contention, runtime HTTP/DB/loader, and stats timings. Use to find *slow*, not just *broken*. The **Boot** Gantt also shows **per-phase RSS deltas + a phase-boundary memory timeline** (boot-start → after-import → after-onReadyBlocking → after-onReady → after-onAllReady) — use it to see which boot phase grows memory. Caveat: onReadyBlocking/onReady plugins run under `Promise.all`, so per-plugin deltas overlap and are only *directional* (the longest-running span absorbs blame for whatever allocates concurrently); the phase-boundary checkpoints are authoritative.
→ [`plugins/debug/plugins/profiling/CLAUDE.md`](../../../plugins/debug/plugins/profiling/CLAUDE.md)

## Memory (heap / RSS / footprint)
For "why is this backend using N GB":
- **Debug → Heap pane** (`heap-snapshot`) — `bun:jsc heapStats()` object-type breakdown (count per JS type, heap size) for a cheap "what's on the JS heap" read, plus an on-demand **full V8 `.heapsnapshot` dump** to `~/.singularity/worktrees/<wt>/heap-<ts>.heapsnapshot` (load offline in Chrome DevTools → Memory, or VS Code). The dump is heavy (blocks the event loop for seconds, hundreds of MB) — manual click only.
- **CAVEAT — `rss` overcounts on macOS.** `process.memoryUsage().rss` (what the boot checkpoints and **health-monitor** log) counts resident-but-clean/reserved/shared pages and dramatically overstates real memory: a backend reading 5+ GB `rss` was measured at **~885 MB true `phys_footprint`** (~6×). The inflation is JSC's WebKit-Malloc reservations (mostly clean), the 65 GB virtual JS Gigacage (≈0 resident), and IOAccelerator/GPU regions. If the JS heap (`heapStats`) is small but `rss` is huge, the "balloon" is off-heap and largely artifact — confirm real memory with `footprint <pid>` or `vmmap -summary <pid>` (look at *dirty* size and `phys_footprint`, not `rss`). File-watchers (@parcel/watcher) are *not* a memory cost — subscribing even to a huge `.git` allocates ~0 MB.
→ [`plugins/debug/plugins/heap-snapshot/CLAUDE.md`](../../../plugins/debug/plugins/heap-snapshot/CLAUDE.md)

## Slow / intermittent contention
For "why is X slow" (especially bursty/contention slowness), beyond the Gantt:
- **`get_runtime_profile` MCP tool** — slowest HTTP / DB / loader spans with the `[acquire]` pool-wait aggregate and per-parent (`byParent`) attribution. Pass `worktree` for another namespace (`"singularity"` = main).
- **Durable `slow_ops` table** (`query_db`) — has real `last_seen_at` / `last_ms`. Use these (not the in-memory profiler's `max_ms`, which is a sticky peak *since server boot*) to tell "happening now" from "old peak". Also surfaced in **Debug → Slow Ops**.
- **`pg_stat_activity`** (`query_db`) grouped by `datname` + `wait_event` — cluster-wide backend / lock picture across all worktrees on the shared Postgres. A query that's slow under load but fast under `EXPLAIN ANALYZE` in isolation is **contention**, not a bad plan.
- **Debug → Health pane** (`health-monitor`) — continuous per-backend time series of **event-loop lag** (p99/max — the headline signal for GC/blocking stalls), **RSS/heap**, and **heap growth**, plus a main-only host strip (load / free-mem / swap). Samples append to `logs/health.jsonl` per worktree and the pane reads them **from disk**, so it works even when a backend is wedged (unlike `get_runtime_profile`, which 404s on an unhealthy backend). Use it to tell a **per-backend** stall (event-loop max spikes, RSS balloon) apart from **host** pressure (load/swap). `cat logs/health.jsonl` for the raw forensic record.
→ [`plugins/debug/plugins/health-monitor/CLAUDE.md`](../../../plugins/debug/plugins/health-monitor/CLAUDE.md)

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
