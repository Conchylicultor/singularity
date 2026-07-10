# Read-admission wedge: two never-settling git loaders latch the app into "data loads forever"

**Status:** Ongoing — mechanism confirmed at the gate layer; the innermost hop (why the two
loader promises never settled) is 🔬 open.
**Symptom (2026-07-10, ~13:10 → still live at 15:40):** the main app's UI renders but **no
live-state data ever arrives** — every pane spins forever. Crucially, **no build/check fleet was
running** at observation time (load 3.7, swap-in 0, backend event-loop p50 ~1 ms): this is NOT the
host-saturation shape. The failure is a **latched state** left behind by an earlier contention
storm, persisting on an otherwise healthy host.

## The confirmed chain (three lines: client logs, live trace snapshot, code)

1. **Delivery layer.** Since **13:10:04**, zero non-`auth-state` `sub-ack`s in
   `logs/live-state.jsonl` (91,059 before, all `auth-state`-only after — that key is served by the
   *central* process, which is fine). Client tabs replay their full ~114–146-sub set on every
   reload/reconnect (2,268 `sendSub` vs 17 `sub-ack` in the last 3k lines). Plain HTTP endpoints
   are fast (`/api/health` 9 ms, `/api/tasks` 158 ms) — which is exactly why the UI shell renders
   while data never arrives. Discriminator: `GET /api/resources/tasks` (the gated resource read
   path) hangs past 15 s.
2. **The gate.** An on-demand trace (`POST /api/debug/trace/test-trigger`) snapshot at 15:39:
   **`read-admit` max 6, active 6, queued 3,833**; `heavy-read-local` 2/2 held + 17 queued;
   host `heavy-read-acquire` 2 held by this process; **db-pool / background lanes idle**.
   `handleSub` awaits `gatedRead` (runtime.ts:2493) before ever sending `sub-ack` — a saturated
   gate mutes every subscription in the app, worktree-wide.
3. **The slot holders.** The trace's open-spans flight window shows exactly **6 subs holding the 6
   slots: 3× `commits-graph.delta` + 3× `edited-files`** — but only **2 open loader spans** (both
   started **13:06:49**, open **71+ min**, `selfMs` ≈ full age, no wait layer charging). The other
   4 slot-holders are **joiners**: the gate admits BEFORE the single-flight dedup
   (runtime.ts:1161-1163 — the comment argues herd keys are distinct, which a stuck flight +
   resubscribe-replay violates), so each replayed sub for the same two keys burned another slot and
   then parked on the same dead flight. Slots filled 13:06:49 → 13:09:44; last app-wide ack
   13:10:04. Sufficiency arithmetic closes: queued 3,833 ≈ 26 reconnect/reload replays × ~146 subs.
4. **The stuck flights.** Both loaders **passed all admission tiers** (`heldByThisProcess = 2`
   proves the host flock slots are held and `fn()` is executing) and are wedged in their own
   compute — with **zero child processes** under the backend (pid 1805). So the git subprocesses
   are gone, but an awaited promise never settled. Both loaders funnel into `tryRunGit`
   (`commit-list/server/internal/run-git.ts:103-111`):
   `Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])`
   — a lost exit/stream settlement on a `Bun.spawn` child that died.
5. **The storm that triggered it.** Both flights started at 13:06:49 inside a heavy contention
   window on this backend (booted 12:47): `flushNotifies` 491 s (background-acquire 304 s),
   `database.fork` job 408 s self, a `live_state_snapshot` SELECT taking 271 s, `sub` spans with
   207 s `read-admit` waits. The storm ended; the wedge stayed. (Aligned with the host-saturation
   track's amplifier findings — but this doc's failure is a *latch*, not a lag.)

## Causes — checklist

- ✅ **Read-admit gate permanently saturated** → no `sub-ack` app-wide since 13:10:04 (gate gauge
  6/6 + 3,833 queued, measured live; `handleSub` code path).
- ✅ **2 never-settling git loader flights** (`edited-files`, `commits-graph.delta`, both started
  13:06:49) hold 2 slots; **4 same-key joiner subs** hold the other 4 because admission precedes
  single-flight dedup.
- ✅ Loaders are NOT queued on any instrumented gate — they hold local + host heavy-read slots and
  are inside their own compute (`selfMs` = full age; `heldByThisProcess = 2`).
- ❌ Host saturation as the *live* cause — load 3.7, swap-in 0, loop p50 1 ms, pg idle at
  observation time. (It was the *trigger* window, not the sustaining cause.)
- ❌ DB layer — pool 0/16 active, `/api/tasks` 158 ms.
- ❌ WS transport / gateway — upgrades succeed (`ws-open` logged), central socket acks fine.
- 🔬 **Innermost hop:** why `tryRunGit`'s `Promise.all` never settled after the children died —
  suspected Bun lost-wakeup on `proc.exited` / stream reader under extreme load (children were
  presumably killed or reaped during the storm). Needs a repro or a heap-snapshot inspection of
  the pending promises (Debug → Heap, `POST` full V8 snapshot) **before restarting the backend**.

## Fix altitudes (none landed yet)

- **Containment (immediate unblock):** restart the main backend — the wedge is in-process state.
- **Boundary invariant A (gate):** admit AFTER single-flight dedup — a joiner must never consume
  an admission slot. Counterfactual for this incident: only 2/6 slots lost; every other resource
  keeps flowing; the app degrades to "two panes stale" instead of "everything loads forever".
- **Boundary invariant B (loader watchdog):** a read-path flight older than N minutes should trip
  a loud trace/report and fail the flight (reject → `sub-error` → client retry), releasing its
  slots. A silent forever-pending loader is currently structurally invisible (event loop healthy,
  no stall profile, nothing in reports).
- **Origin (pending 🔬):** timeout/`AbortSignal` race around `proc.exited` + stream reads in
  `tryRunGit`, or upstream Bun fix, once the lost-settlement mechanism is confirmed.
