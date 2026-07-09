# host-semaphore

Cross-process twin of `packages/semaphore`. `createHostSemaphore({ name, size })`
returns the same `{ run(fn, onWait?) }` shape, but the bound is enforced *across*
processes — at most `size` `run` bodies execute at once across every process
sharing the same `name`, not just within one. Use it to cap CPU-heavy work (git
subprocesses, `git archive | tar`, filesystem walks, JSONL scans) across the ~16
worktree server processes sharing one box, where a per-worktree in-process
`createSemaphore` of N still admits ~16×N concurrent spawns.

The bound is N `flock(2)` advisory lock files under
`~/.singularity/<name>-slots/slot-0.lock … slot-(N-1).lock` (one holder per fd, so
at most `size` holders host-wide). flock auto-releases when the fd closes **or the
holding process dies**, so a SIGKILLed server never leaks a slot — the same
crash-safety the host-wide build pool relies on
(`framework/cli/bin/host-semaphore.ts`).

## Hybrid acquire — fast path in-process, broker only under contention

A blocking `flock(fd, LOCK_EX)` is fatal in a long-running server event loop (it
freezes the loop until the lock frees). So `run` is hybrid:

- **Fast path (in-process):** a non-blocking `flock(LOCK_EX | LOCK_NB)` sweep over
  the N fds. A single `LOCK_NB` syscall is microseconds and never freezes the
  loop. When a slot is free this is the whole story — no subprocess, no tax.
- **Slow path (all slots busy):** the parent spawns a one-shot **broker
  subprocess** (`scripts/broker.ts`) that does the blocking `flock(LOCK_EX)` wait
  off the parent's event loop and writes `granted\n` once it holds a slot. The
  parent just `await`s that line (async stream read — loop never blocks). Closing
  the broker's stdin gives it EOF → it exits → its fd closes → the flock releases.
  If the broker's stdout closes without the token it died early → `run` throws
  loudly rather than silently dropping the bound.

The blocking flock lives **only** in the broker — a subprocess has no event loop
to freeze. `broker.ts` imports nothing cross-plugin (only `node:*` + `bun:ffi`);
its slot dir + size arrive via env, so it stays an independently-runnable script
with no boundary concerns.

## `acquireShare(max)` — a whole share up front, at most one broker

`run` holds exactly one slot. A caller that fans out N units of heavy work would
otherwise `run`-wrap each unit and spawn up to N brokers (one blocking wait per
unit) precisely when the box is already under pressure. `acquireShare(max, onWait?)`
is the answer: **acquire the whole share once, before fanning out.** It blocks until
at least one slot is held, then greedily takes any additional free slots up to `max`
with a single non-blocking sweep, returning a `HostShare { slots, release }` naming
how many it actually got (`1 … min(max, size)`).

- **Idle pool = pure fast path.** The up-front `flock(LOCK_NB)` sweep grabs up to
  `max` free slots in-process — no subprocess, no broker. This is the whole story
  when slots are free.
- **All slots busy = exactly one broker.** Only when the sweep finds nothing do we
  spawn a single broker to do the blocking wait for the *first* slot; once it grants,
  a second non-blocking sweep picks up any extra slots that freed while we waited.
  So a share is **at most one broker per call**, never one per slot.
- `max` is clamped to `size` (asking for more than exists is capped, not an error);
  a non-integer or `< 1` `max` throws loudly. `slots` is never `0` — the call blocks
  or throws instead, so a caller never has to distinguish "got a share" from "got
  nothing".
- `release()` is idempotent: it closes the held fds (flock auto-release) and reaps
  the broker if one was spawned. Trade-off: the whole share is held until `release`,
  so there is some tail waste once only the slowest unit is left — releasing slots as
  work drains is a possible later refinement.

> **Known limitation — a waiter commits to one slot.** `broker.ts` blocks on a single
> pid-hashed slot (`flock(LOCK_EX)` can only wait on one open file description), so if
> a *different* slot frees while it waits, the broker is not woken and that slot sits
> idle. The bound is never violated — this costs utilization and latency, not
> correctness. It matters more for `acquireShare` than for `run`, because a share can
> hold most of the pool for a long time. Reproduced and tracked in
> `task-1783635702105-q3ipa7`; the same line exists in the CLI build pool
> (`framework/cli/bin/host-semaphore.ts`), so the fix belongs with the host-admission
> unification, not here.

`run(fn, onWait)` is now a thin wrapper — `acquireShare(1, onWait)` then
`try { fn() } finally { share.release() }` — so both entry points share one acquire
path and `depth()` / crash-safety are identical between them.

Crash-safety holds on both paths: the held fd is closed in a `finally`, so a
rejecting `fn` never leaks a slot, and parent death closes every fd (or EOFs the
broker), releasing whatever slot was held. See
`research/2026-06-16-global-host-wide-cpu-admission-flock-broker.md` (Change 1).

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
  - Exports: Types: `HostSemaphore`, `HostShare`; Values: `createHostSemaphore`
- Cross-plugin:
  - Imported by: `database/admin`, `debug/profiling/boot-bench`, `infra/host-read-pool`, `infra/worktree`

<!-- AUTOGENERATED:END -->
