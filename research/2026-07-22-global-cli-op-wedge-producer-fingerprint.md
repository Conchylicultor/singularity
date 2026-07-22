# CLI op wedge — the native producer is fingerprinted: Bun.spawn child-stdio stream machinery (`NativeReadableStreamSource`)

**Builds on** [`2026-07-22-global-cli-op-wedge-named-function.md`](./2026-07-22-global-cli-op-wedge-named-function.md)
(the drain is named: `processTicksAndRejections` FTL at `bc#365` = `drainMicrotasks()`,
refilled forever with native jobs; the producer was the open question).

**Status: the producer subsystem is now identified with high confidence — Bun's
child-process piped-stdio ReadableStream machinery — from the 2026-07-22 field
captures.** The definitive native function still needs one symbolication pass,
but every new observation converges on the same subsystem, and it matches
upstream oven-sh/bun#27766 ("spawning concurrent bun processes" spin) exactly.

## New evidence (field captures, 2026-07-22, `~/.singularity/op-wedge-captures.log{,.1}`)

The watchdog banked 13 captures on 07-22 alone (12:21–13:59) plus a 07-21/early-07-22
backlog. Verdict taxonomy: **most field wedges are `idle`** (CPU ≈ 0 — blocked, a
different mode, see below); **5 are `spinning`** (07-21 10:32, 07-21 14:01,
07-22 01:39, 07-22 11:58, 07-22 12:38) — the storm.

### 1. The protected-object triple names the subsystem

Interrogation of the wedged-idle build pid 48826 (worktree `att-1784718308-uqj9`,
07-22 11:57) — protected histogram:

```
object: 1956, Promise: 8, Uint8Array: 8, fn:bound #onClose: 8, fn:anon: 18, …
```

**8 × {`Promise`, `Uint8Array`, `bound #onClose`} is the exact protected-object
signature of `NativeReadableStreamSource`** — Bun's builtin JS wrapper over a
native readable handle, used for `Bun.spawn` piped stdout/stderr. Verified
against the bun 1.3.13 binary's embedded builtins (`strings` on
`~/.local/share/mise/installs/bun/1.3.13/bin/bun`):

- constructor does `handle.onClose = this.#onClose.bind(this)` — the bound fn is
  stored on the **native** handle → gc-protected → shows as `fn:bound #onClose`.
- `#getInternalBuffer` keeps a reusable `Uint8Array` (`this.@data = new Uint8Array(chunkSize)`)
  → the protected buffers, and the **zero-net-allocation** steady state (the
  buffer is recycled, never reallocated).
- `#pull` calls `handle.pull(view, closer)` which can return a **native promise**
  → the protected pending Promises.
- The pull loop re-invokes via `@enqueueJob` / promise-reaction jobs — **native
  microtask jobs with no user JS frames**, i.e. precisely the job type the
  drain-site capture proved the storm is made of.

Only three builtin sites hand a bound `#onClose` to native code: Bun.SQL pooled
Postgres/MySQL connections (not used — the CLI uses `pg` over node:net),
`NodeHTTPServerSocket` (no server in the CLI), and `NativeReadableStreamSource`.
The CLI spawns **everything** with `Bun.spawn(…, { stdout: "pipe", stderr: "pipe" })`
(every git call, build step, migration run). 8 sources = 4 children × 2 pipes.

### 2. The same capture's process trees show the loop starving its own exit signal

The 11:58 spinning specimen (pid 49940, build, 73.5% CPU, 15½ min wedged) had
**4 zombie children (`<defunct>`, unreaped for ~4 min)** under it — matching the
8 pending stdio sources — plus a live orphaned esbuild service. Its lsof shows
**~70 half-dead unix socketpairs (`->(none)`)** — orphaned child-stdio ends never
closed — and **`KQUEUE count=110`** (the 12:38 specimen: 108): a hundred-plus
ready kevents **never drained**. The microtask storm never lets the loop return
to `kevent()`, so child-exit/stdio-close notifications — the very events that
would resolve the pending pulls and end the storm — starve. The wedge is
self-sustaining by construction.

### 3. Two storm presentations, now distinguished

- **Yielding storm** (banked specimens 81345, 41298): heartbeats punctual,
  inspector responsive — the drain exits per turn, refills next turn.
- **Non-yielding storm** (49940 at 11:58, 9216 at 12:38): `Runtime.evaluate`
  **times out** (event loop does not turn for 10 s+). The 12:38 native sample
  shows the canonical drain-chain prefix
  (`…0x8ecf40→0x43a040→0x1a2cc0→0x28591a8→0x25e9648→0x31716b8`) then **deep
  recursive JS** (a JIT frame recursing ~50 levels, a repeating native
  call-triple `0x217fafc→0x2b9b10c→0x2b92ec4×2` between levels, occasional
  `openat` leaves). Same entry path, different burn shape — likely the storm
  observed while reaction jobs synchronously chain (each resolve running the
  next continuation recursively).

### 4. The `2000` constant, sharpened

Re-interrogation of specimen 41298 at 15:54 (2.5 h after first probe): still
**exactly 2000** uniform protected `object`s, byte-stable, drain signature
(`bc#365`/`bc#0`) still present. Across specimens: 1512 (81345), 1956 (48826),
2000 (41298, twice). Reads as **accumulation toward a cap of 2000**, not a
universal pool size — consistent with one protected object per un-finalized
native op, capped. (Also new: the histogram's named constructors — `fn:Resvg`,
`fn:RenderedImage`, `fn:BBox`, `fn:AsyncRenderer`, `fn:custom_gc` — are just
@resvg/resvg-js napi-rs module-registration constants, present in every CLI
process via `commands/release.ts`'s import chain. Not activity evidence; ruled
out as producer.)

### 5. The idle-mode wedges are the storm's fleet-level shadow

The majority-idle captures (builds/checks/pushes at CPU ≈ 0 for 15 min+) hold
open cpu-slot flocks and pending child-stdio pulls (48826's 8 pending sources)
— consistent with ops stuck waiting on children/slots while the host is
gridlocked, i.e. the known one-wedge-starves-the-fleet cascade plus plain
host-duress stalls. They are victims, not instances, of the bun bug.

## Revised mechanism (complete story, all evidence accounted for)

1. A CLI op spawns children with piped stdio; each pipe gets a
   `NativeReadableStreamSource` whose pull promise is fulfilled by native code.
2. Under fleet pressure, a child-exit/stream-close races the pending pull; the
   native source enters a state where reaction jobs keep re-arming (pull →
   fulfill-empty → callPullIfNeeded → pull …) without delivering data or
   observing close.
3. The refill runs entirely as native promise-reaction jobs (no JS frames,
   `process.nextTick`/`queueMicrotask` counters at 0), reuses the internal
   buffer (zero allocation), and needs no syscalls.
4. `drainMicrotasks()` never finds the queue empty; the loop never (or rarely)
   returns to `kevent()`; SIGCHLD/stdio-close events sit undrained (kqueue
   count 100+), children zombify, the op can neither finish nor exit.

## What is still missing for a definitive upstream report

- **The named native function** producing the refill: one symbolication pass of
  the banked offsets (`0x25e9648`, `0x28591a8`, `0x31716b8`, `0x2b92ec4`, …)
  against the official `bun-profile` 1.3.13 darwin-aarch64 build. Mechanical.
- The exact race that flips a healthy source into the re-arm state (why only
  ~once per few hours under fleet pressure).
- On the next armed wedge, the safe probe to run **first**: enumerate live
  spawn/stream state (count `Bun.spawn` subprocesses + their stdio stream
  states, `process._getActiveHandles?.()`) and correlate protected-triple count
  with zombie count. Heap-snapshot (`generateHeapSnapshotForDebugging`) for
  retainer chains — never `jscDescribe`.

## Repro attempts (2026-07-22)

A standalone amplification harness + upstream issue draft live in
[`2026-07-22-global-bun-spawn-wedge-repro/`](./2026-07-22-global-bun-spawn-wedge-repro/)
(`repro.mjs` — N worker bun processes churning piped-stdio children with
exit-races-pull and kill-mid-pull, heartbeat + CPU wedge detection that samples
and preserves any hit). Three 8-minute runs on this host (plain ~320k children;
20 oversubscribed workers with bun children at load-avg 55; long-lived chatty
service child + SIGKILL-mid-transfer) did **not** reproduce. Conclusion: the
field race is rarer than pure churn reaches in minutes and/or requires the
long-lived mixed workload (pg sockets, fsevents, flocks, esbuild service,
hours of uptime). The harness is soak-ready (`--duration 28800`) and doubles as
the executable mechanism description for the bun team.

## Local mitigation candidate (also a causal test)

Remove piped stdio from the equation: have the CLI spawn children with stdio
redirected to files (or `"ignore"` where output is unused) instead of `"pipe"`
— no `NativeReadableStreamSource`, no pull loop. If field wedges stop, cause is
confirmed and cured locally without waiting on upstream. Not implemented; needs
a decision (some call sites parse child stdout and would read the file after
exit instead).
