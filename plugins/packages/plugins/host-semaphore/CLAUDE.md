# host-semaphore

Cross-process twin of `packages/semaphore`.
`createHostSemaphore({ name, size, backgroundLimit? })` returns the same
`{ run(fn, hooks?) }` shape, but the bound is enforced *across* processes — at most
`size` `run` bodies execute at once across every process sharing the same `name`, not
just within one. Use it to cap CPU-heavy work (git subprocesses, `git archive | tar`,
filesystem walks, JSONL scans) across the ~16 worktree server processes sharing one
box, where a per-worktree in-process `createSemaphore` of N still admits ~16×N
concurrent spawns.

`backgroundLimit` (optional, default `size` — no reserved floor) partitions the pool
into two lanes; see **Reserved floor** below.

The bound is N `flock(2)` advisory lock files under
`~/.singularity/<name>-slots/slot-0.lock … slot-(N-1).lock` (one holder per fd, so
at most `size` holders host-wide). flock auto-releases when the fd closes **or the
holding process dies**, so a SIGKILLed server never leaks a slot — the same
crash-safety every host pool relies on (all declared through
`@plugins/infra/plugins/host-admission`, the sole importer of this primitive).

## Hybrid acquire — fast path in-process, fan-out only under contention

A blocking `flock(fd, LOCK_EX)` is fatal in a long-running server event loop (it
freezes the loop until the lock frees). So acquire is hybrid:

- **Fast path (in-process):** a non-blocking `flock(LOCK_EX | LOCK_NB)` sweep over
  the N fds. A single `LOCK_NB` syscall is microseconds and never freezes the
  loop. When a slot is free this is the whole story — no subprocess, no tax.
- **Slow path (all slots busy):** we must *wait* for a slot without blocking the
  loop, and without stranding on one slot. A blocking `flock(LOCK_EX)` parks on a
  **single** open file description, so a waiter that picks one slot is never woken
  when a *different* slot frees — that slot then sits idle. Instead the head waiter
  **fans out**: it spawns one `flock-wait` child per slot (`scripts/flock-wait.ts`,
  via `bun --smol`) and takes the **first** to grant `granted\n`. Any freed slot
  wakes it — including one freed by a **SIGKILLed** holder, since flock releases on
  death too. The losers are then SIGKILLed and reaped (`await exited`), which cancels
  their blocked flocks and hands back any slot a loser had already grabbed, before the
  caller re-sweeps for extras. If every child closes stdout without granting, acquire
  throws loudly rather than silently dropping the bound.

### The turnstile — only the head waiter fans out

Fanning out `size` children *per waiter* would be `size × waiters` processes exactly
when the box is already saturated. A per-pool **turnstile** (`turnstile.lock`, a
single flock file) fixes that: a waiter first takes the turnstile (non-blocking
in-process; if contended, it waits for it via one `flock-wait` child — a single file
is an ordinary flock queue that cannot strand), re-sweeps once (a slot may have freed
while queued), and only *then* fans out. So exactly one head waiter fans out at a
time host-wide. Process cost per contended pool is `size + (W − 1)` (the head's
`size` fan-out children plus one turnstile child per other waiter), versus a naive
`size × W`. A size-1 pool degenerates to today's single child.

**Deadlock-free.** The turnstile is only ever held by *waiters*; a slot-holder never
needs it, and a turnstile-holder waits only for a slot, which holders always release.
The wait-for graph is acyclic.

**Barging is unchanged (no FIFO).** The fast-path sweep does not consult the
turnstile, so a fresh caller can still take a slot a queued waiter was about to win.
The turnstile buys serialized *wakeup*, not FIFO *fairness* — do not assume ordering.

### Why the blocking flock runs on a worker thread

`flock-wait.ts`'s **main thread** stays responsive; the blocking `flock(LOCK_EX)`
runs on a `node:worker_threads` Worker (`scripts/flock-block.ts`). A synchronous FFI
flock has no yield point, so a child that blocked on its *main* thread could not
observe stdin EOF or signals while parked — and if its parent were SIGKILLed (agent
builds are killed on deploy), nobody would be left to SIGTERM it and it would leak
forever (the **orphan** hole). Parking the block on a worker keeps the main thread
free to see stdin EOF and exit, closing that hole. The fd is process-wide, so process
exit releases the lock; the worker deliberately never closes it.

`flock-wait.ts` and `flock-block.ts` import nothing cross-plugin (only `node:*` +
`bun:ffi`); the one lock file arrives via `HOST_SEM_LOCK_FILE`, so they stay
independently-runnable scripts with no boundary concerns.

### Reserved floor — the `background` / `interactive` lanes

`backgroundLimit < size` partitions slot *capacity* (not the turnstile) so that
saturating background work can never starve interactive work of the whole pool. Each
`acquireShare(max, hooks?)` / `run(fn, hooks?)` draws from a lane via `hooks.lane`
(default `"background"` — the safe choice, since it can never reach the floor):

- **`background`** sweeps and fans out only over `slot-0 … slot-(backgroundLimit-1)`.
  Its window is `backgroundLimit` slots; `max` clamps to that. Slots at or above
  `backgroundLimit` are never even *opened* by a background caller, so the reserved
  floor is structurally unreachable — a saturated background lane blocks rather than
  spilling onto it.
- **`interactive`** may use all `size` slots but sweeps them **high-index-first**
  (`slot-(size-1) … slot-0`). This reversal is the whole trick: without it,
  interactive holders would take the low slots in file order and the reserved floor
  (the high slots background can never reach) would sit empty while background starves.
  So an interactive caller lands on the reserved floor first and only touches the
  shared low slots once the floor is full.

When `backgroundLimit === size` (the default — the un-partitioned pools) the two
windows cover the same slot set — `interactive` reversed, `background` forward — and
lane windowing is behaviourally inert; the four historical non-laned pools are
byte-for-byte unchanged.

The **turnstile stays per-pool** (shared across lanes): only slot capacity is
partitioned, not the wakeup serialization. An interactive waiter can briefly queue
behind a background waiter's fan-out for the *wakeup* (a few ms), never for a *slot*.
The deadlock argument is unchanged — the turnstile is held only by waiters, a
turnstile-holder waits only for a slot, and slot-holders always release. Acyclic.

### Size and split are the pool's identity

`size` names the slot-file *set*, so an old-size process holding `slot-7.lock` is
invisible to a new-size process that only sweeps `slot-0..3` — the bound would be
silently exceeded. `backgroundLimit` names where the reserved floor begins, so two
processes that disagree on it carve the same slots at different indices — one's
background slot is another's reserved-interactive slot, and the floor guarantee
silently breaks. A `<dir>/size` sentinel makes any mismatch loud by encoding **both**
as `"<size>:<backgroundLimit>"` — a process built for a different split is as loud as
one built for a different size. On first acquire the check takes a guard on
`<dir>/.size.lock` (non-blocking flock in-process; if contended — another process is
mid-initialization, a benign race — it **waits** for the guard via one `flock-wait`
child, never crashing on the contention), then read-modify-writes the sentinel: absent
→ write it; equal on both numbers → proceed; different on either → a non-blocking sweep
decides — if the pool is idle it resizes silently (rewrite the sentinel, unlink
now-extra slot files), otherwise it **throws** (`pool is live at size
<oldSize>:<oldBackgroundLimit>, but this process was built for <size>:<backgroundLimit>`).
A bare legacy `"<size>"` sentinel (pre-reserved-floor) reads as `size:size` (no floor),
so the historical non-laned pools migrate silently rather than crashing; only a number
missing/invalid, `backgroundLimit > size`, or a stray third field is corruption and throws. The
check is memoized as an in-flight promise (concurrent in-process callers share one run)
and cleared on failure. The only non-corruption crash here is a genuine live
size/split mismatch — a silent overcommit or floor break becoming a crash.

## `acquireShare(max)` — a whole share up front

`run` holds exactly one slot. A caller that fans out N units of heavy work would
otherwise `run`-wrap each unit precisely when the box is already under pressure.
`acquireShare(max, hooks?)` is the answer: **acquire the whole share once, before
fanning out.** It blocks until at least one slot is held, then greedily takes any
additional free slots up to `max` with a single non-blocking sweep, returning a
`HostShare { slots, release }` naming how many it actually got (`1 … min(max, size)`).

- **Idle pool = pure fast path.** The up-front `flock(LOCK_NB)` sweep grabs up to
  `max` free slots in-process — no subprocess. This is the whole story when slots
  are free.
- **All slots busy = turnstile + fan-out.** Only when the sweep finds nothing does
  the head waiter take the turnstile and fan out one child per slot (see above),
  taking the first grant; a second non-blocking sweep then picks up any extra slots
  that freed while we waited.
- `max` is clamped to the acquiring lane's window size (`backgroundLimit` for
  `background`, `size` for `interactive`; asking for more than the window holds is
  capped, not an error); a non-integer or `< 1` `max` throws loudly. `slots` is never
  `0` — the call blocks or throws instead, so a caller never has to distinguish "got a
  share" from "got nothing".
- `release()` is idempotent: it closes the held fds (flock auto-release) and reaps
  the winner child if one was spawned. Trade-off: the whole share is held until
  `release`, so there is some tail waste once only the slowest unit is left —
  releasing slots as work drains is a possible later refinement.

`run(fn, hooks)` is a thin wrapper — `acquireShare(1, hooks)` then
`try { fn() } finally { share.release() }` — so both entry points share one acquire
path and `depth()` / crash-safety are identical between them.

## Hooks — observing the wait without coupling to a profiler

`AcquireHooks` carries two optional callbacks, neither of which gates behavior:

- `onWaitStart()` — fires when the slow path is entered (every slot busy), **before**
  any child is spawned; never on the fast path. Lets a caller *open* a "waiting for a
  slot" span.
- `onAcquired(waitMs)` — fires once, fast path or slow, at acquisition before the body
  runs, with the milliseconds waited (≈0 on the fast path). Replaces the old positional
  `onWait` and keeps identical semantics.

Crash-safety holds on both paths: the held fd is closed in a `finally`, so a
rejecting `fn` never leaks a slot, and parent death closes every fd (or EOFs the
winner child), releasing whatever slot was held. See
`research/2026-06-16-global-host-wide-cpu-admission-flock-broker.md` (Change 1) and
`research/2026-07-10-global-host-semaphore-any-slot-wakeup.md` (fan-out + turnstile).

Exposed from a **`server`** barrel (not `core`): it uses `bun:ffi`, `node:fs`, and
`Bun.spawn`, none browser-safe. The barrel carries the conventional inert
`ServerPluginDefinition` default export (description only — no routes, resources,
or hooks); it is consumed purely as a library via its named `createHostSemaphore`
export.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Cross-process concurrency primitive: createHostSemaphore bounds work across processes via flock slot files (the host-wide twin of packages/semaphore).
- Server:
  - Uses: `infra/paths.SINGULARITY_DIR`
  - Exports: Types: `AcquireHooks`, `HostSemaphore`, `HostShare`; Values: `createHostSemaphore`
- Cross-plugin:
  - Imported by: `infra/host-admission`

<!-- AUTOGENERATED:END -->
