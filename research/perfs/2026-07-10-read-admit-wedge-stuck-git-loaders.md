# Read-admission wedge: nested heavy-read slots deadlock the warmup drain, latching "data loads forever"

**Status:** Ongoing — root cause CONFIRMED at every layer (code + live gauges + lsof + timing);
fix not yet landed. **Recurs on every main-backend boot** since `0d50139c7` (2026-07-10 12:07).
**Symptom (2026-07-10, first 13:10, again ~15:56 after a restart):** the main app's UI renders but
**no live-state data ever arrives** — every pane spins forever. Host is quiet (load 3.7, swap 0,
event-loop p50 ~1 ms): NOT the host-saturation shape. Plain HTTP endpoints stay fast
(`/api/health` 9 ms, `/api/tasks` 158 ms), which is why the shell renders while data never loads.

## Root cause (the full chain, innermost → symptom)

1. **Nested `withHeavyReadSlot` acquisition = structural deadlock.** The warmup executor wraps
   EVERY warmup in `withHeavyReadSlot` (`warmup/executor.ts:56`, `WARMUP_CONCURRENCY = 2`). The
   corpus-index refresh acquires ANOTHER `withHeavyReadSlot` **per parsed file** *inside* that
   (`corpus-index.ts` parse pipeline, `refreshCorpus`). `withHeavyReadSlot`'s in-process local gate
   (`heavy-read-local`) has **2 slots** (`host-read-pool/pool.ts`, `localSize()` = ceil(4/2)).
2. **Two nesting warmups exist on main since today.** `stats.cost.usage` (host scope; `loadBundle`
   → `costIndex.ensureFresh()`) and `sonata.midi-folders.reconcile` (worktree scope; `reconcile()`
   → `midiIndex.ensureFresh()`), the latter added by **`0d50139c7`** (midi-folders migrated onto
   `defineCorpusIndex`). With `WARMUP_CONCURRENCY = 2` both run concurrently: each outer wrapper
   takes one local slot (**2/2 held**) + one host slot, then each inner per-file acquisition queues
   on the local gate — held only by their own outer wrappers. **Circular wait, forever.** Before
   today there was ONE nesting warmup, so a free local slot always remained → the deadlock was
   unreachable. (The midi index is enumerate-only — `parse` resolves `null` — but the per-file
   `withSlot` wrap still runs; and its index file has never persisted, so every file is "new".)
3. **The deadlock starves every heavy-read consumer.** `edited-files`, `commits-graph.delta`,
   `plugin-tree.structure` etc. queue at the local gate forever (observed `heavy-read-local`
   queued=17; their spans show **no** heavy-read charge — `onAcquired` never fires).
4. **The starved loaders pin the read-admission gate.** `handleSub` awaits `gatedRead`
   (runtime.ts:2493) under the 6-slot `read-admit` gate, which **admits before the single-flight
   dedup** (runtime.ts:1161) — so every resubscribe replay for the two git keys burned another slot
   (observed: 3× `commits-graph.delta` + 3× `edited-files` holding 6/6, one real flight each + 4
   joiners). Queue observed at **3,833** (≈26 reload replays × ~146 subs), then 1,437 after the
   15:53 restart re-formed the wedge.
5. **No sub is ever acked again** → all live-state data frozen, worktree-wide, while HTTP stays
   fast. Last app-wide acks: 13:10:04 (first incident), ~15:56 (recurrence, ~3 min after boot =
   the warmup drain, which runs after `onAllReady`).

## Evidence (converging, all fresh 2026-07-10)

- **Gauges (on-demand trace, `POST /api/debug/trace/test-trigger`):** `read-admit` 6/6 +
  1,437–3,833 queued; `heavy-read-local` 2/2 + 17 queued; `heavy-read-acquire` heldByThisProcess=2;
  db-pool/background lanes idle.
- **lsof on the backend:** holds `heavy-read-slots/slot-2.lock` + `slot-3.lock` open (the two outer
  host slots) with **no data file open, no child processes, ~3 % CPU** — not reading, not spawning:
  parked on a semaphore.
- **Flight window:** ZERO open spans carry a heavy-read charge → the slot holders are the
  context-less warmup wrappers, not any loader; the 6 read-admit holders are the two git-loader
  flights + 4 same-key joiners, none past the local gate.
- **Persistence:** `~/.singularity/sonata/midi-folders-index.json` has NEVER been written;
  `cost-usage/index.json` untouched since 12:47:49. Both refreshes never complete.
- **Boot profile:** `pages.search.backfill` + `reports.backfill-noise` complete in ms at ~20 s
  after boot; the two corpus warmups never appear in the completed list (still open).
- **Dating:** first-ever occurrence 13:06→13:10, on the first boot (12:47) of `0d50139c7`;
  reproduced ~3 min after the 15:53 restart. Same signature both times.

## Causes — checklist

- ✅ **Local-gate deadlock via nested `withHeavyReadSlot`** (executor outer wrap × corpus per-file
  inner wrap × 2 concurrent nesting warmups × local size 2). Confirmed: code + gauges + lsof +
  never-persisting indexes + boot-relative timing.
- ✅ Amplifier 1: starved git loaders pin `read-admit` (6/6) because admission precedes
  single-flight dedup → joiners burn slots.
- ✅ Amplifier 2: client resubscribe replays (per reload/reconnect) grow the queue unboundedly.
- ❌ "Bun lost spawn-exit wakeup" (this doc's earlier hypothesis) — killed by lsof: the holders
  keep slot-fds open with no children ever spawned for git; they never reached their compute.
- ❌ Host saturation as live cause — quiet host during both observations.
- ❌ DB layer, WS transport, gateway — all verified healthy.

## Fix altitudes

- **Origin cure LANDED 2026-07-10 (~16:00): `withHeavyReadSlot` is now reentrant** — an ambient
  `AsyncLocalStorage` "already holding" flag runs `fn` directly instead of re-queuing
  (`host-read-pool/server/internal/pool.ts`). One logical job = one slot; nested acquisition is
  structurally impossible for every present and future caller. Pinned by a regression test that
  reproduces the exact shape against the real two-tier gate (`pool.test.ts`: saturate the local
  tier, nest inside a holder — fails by 3 s timeout pre-fix, verified both ways). **Not yet
  re-validated live** — status stays Ongoing until a main boot drains both corpus warmups to
  completion (both index files persist) and `/pages`+`/sonata` subs ack.
- **Containment A (gate, not built):** read-admit should admit AFTER single-flight dedup — a joiner
  must never consume an admission slot (would have degraded this incident to two stale panes).
- **Containment B (watchdog, not built):** a read-path flight (or held heavy-read slot) older than
  N minutes trips a loud report; today a parked-forever holder is invisible (loop healthy, no stall
  profile, nothing in reports).
- **Restart alone does NOT fix it (pre-fix)** — the deadlock re-forms at every warmup drain
  (~20 s–3 min after boot).
