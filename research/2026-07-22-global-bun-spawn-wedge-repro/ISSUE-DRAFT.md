# [DRAFT — for user review, do not post as-is]

Title: Event loop wedges at ~100% CPU: microtask queue drained synchronously
inside kqueue poll dispatch after piped child-stdio reads — kevent starved,
children zombify (symbolicated stacks attached)

## Summary

On macOS ARM64, a long-running bun process that spawns many short-lived
children with `stdio: "pipe"` occasionally (a race; roughly a few hits per day
across ~10 continuously-building processes) locks into a permanent ~100% CPU
spin. The op never completes, the process never exits, child-exit events are
never delivered, and children accumulate as unreaped zombies. Likely the same
family as #27766 — but we have fully symbolicated mid-wedge stacks that name
the mechanism.

Environment: bun 1.3.13 (others report the family on 1.3.14 / 1.4.0-canary in
#27766), macOS 26.4 (Darwin 25.4.0), Apple Silicon (M-series, 18 cores).

Symbolication note for reproducibility: the release `bun-darwin-aarch64` binary
has a byte-identical `__text` to the published `bun-darwin-aarch64-profile`
artifact, so `sample` offsets symbolicate exactly with `atos` against the
profile build's dSYM. All stacks below were obtained that way from live wedged
processes and cross-checked against the `bun-v1.3.13` source tag.

## The symbolicated wedge stack (100% of samples, two independent specimens)

Two wedged builds (959/959 and 210/210 samples over ~10 s of `sample`, one
chain, main thread):

```
us_internal_dispatch_ready_polls                       (usockets kqueue dispatch)
→ io.PipeReader.PosixBufferedReader.readSocket         (PipeReader.zig:443 — child-stdio socketpair)
→ FileReader.onReadChunk
→ webcore.streams.Result.Pending.run                   (streams.zig:503 — fulfills the pending
                                                        ReadableStream pull promise)
→ EventLoop.drainMicrotasksWithGlobal                  (event_loop.zig:135 — SYNCHRONOUS, still
                                                        inside the poll-dispatch frame)
→ JSC runInternalMicrotask
→ MicrotaskCall::tryCallWithArguments<JSGenerator*>    (async-function resume)
→ deep recursive JIT-compiled JS (unnameable from native frames; each level
  includes a RegExp test via operationRegExpTestString / Yarr)
```

I.e.: a read completion on a spawned child's piped stdout fulfills the stream's
pull promise, and bun then drains the **entire microtask queue synchronously
from inside the kqueue dispatch**. When the resumed continuation chain is long
(or self-sustaining), the loop cannot return to `kevent()` — which starves the
very events (child exit, pipe close) that would let the work finish:

- `lsof` on wedged pids shows `KQUEUE count=108–110` — a hundred-plus ready,
  undrained kevents;
- process trees show **zombie children unreaped for minutes** and dozens of
  half-closed stdio socketpairs (`->(none)`);
- the inspector cannot get a `Runtime.evaluate` through (event loop never
  turns).

There is a second presentation on other specimens where the loop still turns
(timers fire, inspector responsive) but every pass re-fills:
`Run.boot/waitForPromise (event_loop.zig:565) → tick (:518) →
drainMicrotasksWithGlobal (:135) → JSC__JSGlobalObject__drainMicrotasks →
Bun::JSNextTickQueue::drain (JSNextTickQueue.cpp:97) →
processTicksAndRejections|FTL` at **bc#365**, which we calibrated to the
`drainMicrotasks()` call site in `ProcessObjectInternals.ts` — with no other JS
frame ever on the stack. On those specimens we measured, live at full burn:

- `process.nextTick` / `queueMicrotask` wrapped with counters: **0 calls** —
  the refilling jobs are enqueued natively;
- `bun:jsc.heapStats()` deltas over 10–30 s: heapSize +2 KB, objectCount +12 —
  **zero net allocation**, a steady-state loop;
- `getProtectedObjects()` histograms hold matched sets of
  `Promise` / `Uint8Array` / `bound #onClose` (8 of each = 4 children × 2
  pipes) — live `NativeReadableStreamSource` instances (the bound `#onClose`
  stored on the native handle, the recycled internal read buffer, a pending
  native `pull()` promise), plus ~1500–2000 uniform protected plain objects,
  count stable for hours.

## Repro attempt (attached: repro.mjs)

The attached single-file harness amplifies the suspected race: N worker bun
processes concurrently spawning short-lived piped-stdio children — half
fast-exit (exit races the first pull), half killed 0–5 ms after spawn (exit
guaranteed to race a pending pull) — with a heartbeat+CPU watchdog that
`sample`s and preserves any worker that stops progressing at high CPU.

Honest result: **not yet reproduced synthetically.** Three 8-minute runs on the
affected machine (~700k raced spawns total; plain, 20-worker oversubscribed
with bun-executable children at load-avg 55, and long-lived chatty service
child + SIGKILL mid-transfer) stayed clean. In the field the hit rate is a few
per day across ~10 processes doing far fewer spawns — so the trigger needs
more than the bare spawn/exit race (long uptime and/or interaction with the
processes' other event sources: Postgres sockets, fsevents watchers, flocked
files, a long-lived esbuild service child). The harness doubles as an
executable description of the mechanism and is soak-ready.

## Workaround we are deploying

Spawning children with stdio redirected to temp files (read after exit)
instead of `"pipe"` removes the `NativeReadableStreamSource` / pull-promise
path entirely.

## What we can offer

Every one of our CLI processes is pre-armed with `--inspect`, so wedged
processes are fully profilable while burning. We can run any diagnostic you
want on the next live field specimen, and can attach: full symbolicated
samples from four specimens, the offset→symbol table, protected-object
histograms, lsof/process-tree captures, and heap-stat deltas.
