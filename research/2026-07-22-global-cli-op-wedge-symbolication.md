# CLI op wedge — native frames symbolicated: the producer is bun's child-stdio PipeReader → stream pull-promise fulfillment

**Builds on**:
- [`2026-07-22-global-cli-op-wedge-named-function.md`](./2026-07-22-global-cli-op-wedge-named-function.md) — the JS drain is named (`processTicksAndRejections` FTL, bc#365 = `drainMicrotasks()`); the native producer was the open question.
- [`2026-07-22-global-cli-op-wedge-producer-fingerprint.md`](./2026-07-22-global-cli-op-wedge-producer-fingerprint.md) — subsystem hypothesis (Bun.spawn piped-stdio stream machinery) from the protected-object triple.

**Status: every banked native offset is now named, with exact source file:line, at
full confidence.** The stacks confirm the producer subsystem: **bun's child-stdio
pipe reader (`io.PipeReader`, reading the child's stdio socketpair) fulfilling a
ReadableStream pull promise (`webcore.streams.Result.Pending.run` →
`Result.fulfillPromise`) and synchronously draining microtasks from inside the
kqueue poll dispatch.** The non-yielding storms are 100% inside that one chain.
Two findings from prior docs are corrected below (the crash `.ips` backtrace, and
the "call triple").

## Method — why the mapping is exact, not approximate

The concern was that `bun-profile` is a different compile than the stripped
release binary, so offsets would not transfer. **They transfer exactly — the two
binaries are the same link.** Evidence:

1. Downloaded `bun-darwin-aarch64-profile.zip` from the official
   `bun-v1.3.13` GitHub release (contains `bun-profile`, a 1.3 GB dSYM, and the
   linker map).
2. Release binary (`~/.local/share/mise/installs/bun/1.3.13/bin/bun`, the exact
   binary every specimen ran): stripped to 1 defined symbol, but `__TEXT` at
   fileoff 0 / vmaddr 0x100000000 — so a sample's "load address + OFFSET" is
   directly a file/vm offset.
3. Section tables are **identical** in both binaries — `__text` at addr
   0x100000cc0, size 0x317092c, fileoff 3264 in both; every section address
   matches. The only difference: the release lacks `__gcc_except_tab` and
   `__eh_frame` (stripped), which sit *after* all code.
4. **`sha256(__text)` is byte-identical across the two binaries**
   (`09666f84…`). The release is the profile build minus EH/symbol data.
   Therefore offset→symbol lookups against the profile dSYM are exact for the
   release binary — no byte-matching heuristics were needed.

Symbolication: wrapped the bare Mach-O dSYM companion into a `.dSYM` bundle and
ran `atos -o bun.dSYM -arch arm64 -l 0x100000000` on `0x100000000 + offset`.
Also re-symbolicated the full banked `sample(1)` outputs and the crash `.ips`.
Artifacts: `~/.singularity/wedge-captures-manual/symbolication-20260722/`
(offset table, symbolicated samples for specimens 81345 / 49940@11:58 /
9216@12:38 / 94560@01:39 / 91991@07-21-10:32, symbolicated `.ips`, and the
script). Source lines were cross-checked against the `bun-v1.3.13` tag on
GitHub; cited lines below were verified to contain what the symbol claims
(inlined-frame line attribution can skew by a few lines inside `autoTick`; frame
identity is unambiguous).

## Offset → symbol table

All mappings are **exact** (byte-identical text section + dSYM). Sanity checks
requested up front all pass: `0x31716b8` is JS-call machinery; the
`0x8ecf40 → 0x43a040 → 0x1a2cc0` chain is the event-loop → microtask-drain path.

### Canonical storm chain (every spinning specimen)

| Offset | Symbol | Source |
|---|---|---|
| `0x8e7dd0` / `0x8e7de4` | `bun.js.event_loop.waitForPromise` (the `tick()` / `autoTick()` call sites of its while-pending loop) | event_loop.zig:565 / 557 |
| `0x8ed164` | `bun.js.event_loop.tick` — at the `drainMicrotasksWithGlobal` call | event_loop.zig:518 |
| `0x8ed360` | `bun.js.event_loop.autoTick` — at the kqueue tick call | event_loop.zig:390 |
| `0x8ecf40` | `bun.js.event_loop.drainMicrotasksWithGlobal` | event_loop.zig:135 |
| `0x43a040` | `JSC__JSGlobalObject__drainMicrotasks` | ZigGlobalObject.cpp:2904 |
| `0x1a2cc0` | `Bun::JSNextTickQueue::drain` — at the `JSC::call(drainFn)` site invoking the JS `processTicksAndRejections` | JSNextTickQueue.cpp:97 |
| `0x28591a8` | `JSC::call` | CallData.cpp:56 |
| `0x25e9648` | `JSC::Interpreter::executeCallImpl` | Interpreter.cpp:1318 |
| `0x31716b8` | `llint_call_javascript` +8 — the native→JS entry trampoline (JIT frames follow) | LLInt asm |
| `0x3198724` | `op_call_return_location` — the LLInt JS→JS call return address; this is the "repeated recursion frame" | LLInt asm |

### The producer path (the frames between kqueue and the drain)

| Offset | Symbol | Source |
|---|---|---|
| `0x58cec4` | `us_loop_run_bun_tick` — at the dispatch-ready-polls call | epoll_kqueue.c:384 |
| `0x58cd4c` | `us_internal_dispatch_ready_polls` | epoll_kqueue.c:264 |
| `0xd16f88` (also `0xd170ac`) | `io.PipeReader.PosixBufferedReader.readSocket` — reads the **child-stdio socketpair** (`recvNonBlock`) | PipeReader.zig:443 |
| `0x86d3f4` | `io.PipeReader.BufferedReaderVTable…onReadChunk` — vtable thunk into `FileReader.onReadChunk` (the native ReadableStream source for piped child stdio) | PipeReader.zig:23 → FileReader.zig:309 |
| `0x9dd1e8` | `bun.js.webcore.streams.Result.Pending.run` — at `Result.fulfillPromise`: **fulfills the pending stream-read (pull) promise**, then synchronously drains microtasks | streams.zig:503 |

### Microtask internals (below `processTicksAndRejections`'s bc#365)

| Offset | Symbol | Source |
|---|---|---|
| `0xedddc` | `Bun::jsFunctionDrainMicrotaskQueue` — the native binding behind the builtin's `drainMicrotasks()` call; **direct confirmation of the bc#365 calibration** | BunProcess.cpp:3533 |
| `0x2c2f1e0` | `JSC::VM::drainMicrotasks` | VM.cpp:1438 |
| `0x2b4de8c` / `0x2b4dfdc` | `JSC::MicrotaskQueue::drainWithUseCallOnEachMicrotask` / `drainImpl<true>` | MicrotaskQueue.cpp:246 / 193 |
| `0x29d0a70` | `JSC::runInternalMicrotask` — an **internal (native-created) microtask** | JSMicrotask.cpp:1186 |
| `0x29ddbc4` | `JSC::MicrotaskCall::tryCallWithArguments<JSC::JSGenerator*, …>` — **resuming a generator, i.e. an async-function continuation** | MicrotaskCallInlines.h |

### The 12:38 "call triple" — corrected: it is RegExp, not call machinery

| Offset | Symbol | Source |
|---|---|---|
| `0x217fafc` | `operationRegExpTestString` — DFG JIT slow path for `regexp.test(str)` | DFGOperations.cpp:1711 |
| `0x2b9b10c` | `JSC::RegExpObject::matchInline` | RegExpObjectInlines.h:144 |
| `0x2b92ec4` / `0x2b92f6c` | `JSC::RegExp::matchInline` | RegExpInlines.h:282 / 306 |
| `0x2e698e8` / `0x2e6d0c0` / `0x2e7506c` | `JSC::Yarr::interpret` / `Interpreter<u8>::interpret` / `matchDisjunction` — the regex bytecode interpreter | YarrInterpreter.cpp |

The up-front prediction ("should be JSC call/CachedCall machinery") was **wrong**
and is reported as such: the triple sits between JIT frames because a
DFG-compiled JS frame calls the `operationRegExpTestString` runtime function.
The deep recursion is JS-level self-recursion (same JIT return address ~50
levels deep, alive — sample counts decay smoothly 567→56 with depth) performing
a `RegExp.test` at each level. The recursing JS function itself is
JIT-compiled and cannot be named post-mortem from native samples.

### Entry prefix (process identity, as expected)

`0x59ae78` `main` (start.zig:602) → `0x59c04c` `cli.Cli.start` (cli.zig:20) →
`0x8492a0` `cli.Command.start` (cli.zig:1014) → `0x82e708`
`RunCommand.exec` (run_command.zig:1676) → `0x82fc84` `_bootAndHandleError` →
`0x82d88c` `bun.js.Run.boot` (bun.js.zig:298) → `0x1f210` `JSC__VM__holdAPILock`
→ `0x87e7d0` `OpaqueWrap.callback` (jsc.zig:234). I.e. the process is inside
`Run.boot`'s **`waitForPromise` on the entry-point module promise** — the normal
"await the script to finish" loop of any `bun run`.

### Crash `.ips` — corrected: it is the probe's death, not the storm's

`0x295510c` = `JSC::JSCell::toObjectSlow` (JSCell.cpp:196), `0x2b5b534` =
`JSC::objectProtoFuncToString` (ObjectPrototype.cpp:346). The full symbolicated
faulting-thread stack shows the whole inspector dispatch:
`BunInspectorConnection::receiveMessagesOnInspectorThread` →
`InspectorRuntimeAgent::evaluate` → `evaluateWithScopeExtension` →
`Object.prototype.toString` → `toObjectSlow` **assertion** (`EXC_BREAKPOINT`).
So the `.ips` is the backtrace of the fatal `jscDescribe` follow-up probe
calling `toString` on a protected *internal* JSC cell (one that cannot be
converted to an object — itself evidence the ~1512/2000 protected "objects" are
raw internal cells, e.g. native promise reactions), **not** a snapshot of the
storm. The prior doc's description ("a full native backtrace of the storm at the
instant of death") is corrected. The outer frames do confirm the wedge context:
the inspector task runs from `event_loop.tick → tickQueueWithCount` under the
same `waitForPromise`.

## The reconstructed stacks — what the storm actually is

### Non-yielding storm (11:58 pid 49940; 12:38 pid 9216) — the producer, on-stack

959/959 samples (11:58, 10 s at 1 ms) and 210/210 (12:38) are this ONE chain:

```
waitForPromise → autoTick → us_loop_run_bun_tick → us_internal_dispatch_ready_polls
→ PipeReader.PosixBufferedReader.readSocket        (child-stdio socketpair read)
→ BufferedReaderVTable.onReadChunk (FileReader)     (native ReadableStream source)
→ streams.Result.Pending.run                        (fulfill the pending pull promise)
→ drainMicrotasksWithGlobal → …next-tick drain → processTicksAndRejections (JIT)
→ jsFunctionDrainMicrotaskQueue → VM::drainMicrotasks → MicrotaskQueue::drainImpl
→ runInternalMicrotask → MicrotaskCall::tryCallWithArguments<JSGenerator*>   (async-fn resume)
→ llint_call_javascript → op_call_return_location × ~50   (deep recursive JIT JS)
→ … operationRegExpTestString → Yarr interpret            (regex test per level)
```

Reading: a chunk arrives on a child's stdio pipe; bun fulfills the stream's pull
promise and **synchronously drains the microtask queue from inside the kqueue
dispatch** (`Result.Pending.run` → `drainMicrotasksWithGlobal` is one frame —
verified in streams.zig: `run()` → `Result.fulfillPromise`). The resumed
async-function continuation then runs for **minutes+** (the specimen was wedged
15½ min at 73–90% CPU with this exact stack for 100% of samples) in deep
recursion doing regex tests. Because the loop never returns from
`us_internal_dispatch_ready_polls`, the remaining ready kevents are never
dispatched — mechanically explaining the observed `KQUEUE count=108–110`,
the 4 unreaped zombie children, and the inspector `Runtime.evaluate` timeouts.
This is the fingerprint doc's mechanism, now with every native frame named.

Honest limits: the recursing JS function cannot be named from native samples
(JIT frames); and strictly, a >15-minute never-finishing computation is proven,
an *infinite* one is not — though the op never completes and only dies by kill.

### Yielding storm (banked specimens 81345, 41298) — drain-overhead spin; producer not on-stack

The banked `native.sample.txt` (240 samples, pid 81345 at 97–99% CPU) shows the
main thread entirely inside `waitForPromise`'s `tick()`/`autoTick()` alternation:
~115/118 of `tick` inside `drainMicrotasksWithGlobal`, of which nearly all is
**per-pass machinery**, not job execution — `JSNextTickQueue::drain` → `JSC::call`
→ VM entry/exit services (`executeEntryScopeServicesOnEntry`,
`SamplingProfiler::noticeVMEntry`, `VMEntryScope` setup) with only ~19/240
samples ever reaching `jsFunctionDrainMicrotaskQueue` and those in queue
bookkeeping. `autoTick` almost never blocks (1 sample in kqueue vs 34 at its
post-poll lines): the kevent poll returns immediately every pass.

The decisive structural fact comes from the C++ source of the named frame:
`JSNextTickQueue::drain` (JSNextTickQueue.cpp) **only performs the `JSC::call`
into `processTicksAndRejections` when the next-tick queue is non-empty** (it
first drains microtasks if the queue looks empty, then re-checks). That call is
on the stack in ~80/81 drain passes. Combined with the live-specimen measurement
of `process.nextTick` / `queueMicrotask` JS wrappers at **0 calls**, this proves:
**native code (or native microtask jobs) enqueues into the tick/microtask queues
on every single pass** — the refill is real and native, not an artifact.
What does *not* appear on the yielding stack is the enqueuer itself: the per-pass
job is so cheap (< ~1% of pass time) that a 1 ms sampler only catches the drain
overhead around it. So for the yielding storm, the producer's *identity* remains
inferred, not stack-proven: the inference (same PipeReader/stream subsystem in
its re-arm-without-data mode) rests on the protected-object triple
{Promise, Uint8Array, bound `#onClose`} from the fingerprint doc, the proven
pipe-stream involvement in the non-yielding storms, and this specimen's held
sockets.

### Reclassification of the 07-21 "spinning" specimens

Symbolicating the 07-21 10:32 (pid 91991) and 14:01 (pid 47482) captures shows
their **main threads mostly parked in `kevent64`** (311/350 samples at 10:32) —
the CPU verdict (0.88–0.96) was earned by *other* threads, consistent with the
07-21 GC-sink finding (libpas scavenger + heap helpers), not by a main-thread
microtask storm. The pipe-read → `Result.Pending.run` → drain → promise-reaction
chain still appears there (2 samples, resuming a plain-JS reaction that
allocates `Uint8Array`s — stream chunk consumption), but as normal traffic. So
the watchdog's `spinning` verdict covers at least two distinct burn modes;
main-thread-storm diagnosis needs the sample, not just the CPU ratio.

## What the symbols say about the producer — bottom line

- **Subsystem: named and stack-proven for the non-yielding storms.** Bun's
  child-process piped-stdio machinery: `io.PipeReader` (socketpair read) →
  `FileReader.onReadChunk` (the native ReadableStream source `Bun.spawn` gives
  piped stdout/stderr) → `streams.Result.Pending.run`/`fulfillPromise` (pull
  promise) → synchronous microtask drain → async-function resume. This matches
  the fingerprint doc's `NativeReadableStreamSource` hypothesis at the Zig layer
  below it, and upstream oven-sh/bun#27766's spawn-correlated spin.
- **Job type: named.** The storm's microtasks are JSC *internal* microtasks
  (`runInternalMicrotask`) resuming generators/async-functions
  (`MicrotaskCall::tryCallWithArguments<JSGenerator*>`) — native-created, no JS
  enqueue, exactly as measured on the live specimen.
- **The single most load-bearing design fact:** bun drains the entire microtask
  queue **synchronously inside the pipe-read poll dispatch**
  (`Result.Pending.run` → `drainMicrotasksWithGlobal`, one frame apart). Any
  long-running continuation resumed by a child-stdio chunk therefore blocks
  kqueue dispatch entirely — child-exit and stdio-close events (the ones that
  would end the wait) starve behind it. The wedge is self-sustaining by
  construction, now visible in named frames.
- **Still open:** the exact enqueuer in the *yielding* storm's re-arm cycle
  (needs the next armed specimen: count `drainImpl` iterations / hook the
  internal-microtask path, or a debug-build repro), and the name of the deeply
  recursing JS function (JIT frames; would fall out of the armed-specimen
  protocol's `startSamplingProfiler` step, which symbolicates JS).

## Artifacts

- Offset table + all symbolicated samples + `.ips` + script:
  `~/.singularity/wedge-captures-manual/symbolication-20260722/`
- Profile build + dSYM bundle + linker map (33 MB, useful for future lookups):
  scratchpad `symbolication/` dir (re-downloadable from the `bun-v1.3.13`
  release; the dSYM wrap is `bun.dSYM/Contents/Resources/DWARF/bun-profile`).
- Layout-identity proof: `sha256(__text)` = `09666f84…` in both binaries;
  section tables byte-equal (see Method).
