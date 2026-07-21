# CLI op wedge — live-specimen verdict: a self-sustaining main-thread JS loop, not paging, not GC threads, not rollup

**Supersedes the mechanism claims of all prior wedge docs** (keep them for the
trail):
- [`2026-07-19-global-cli-op-wedge-investigation-state.md`](./2026-07-19-global-cli-op-wedge-investigation-state.md) — "idle hang" framing: wrong for culprits (right for victims).
- [`2026-07-20-global-cli-op-wedge-capture-watchdog.md`](./2026-07-20-global-cli-op-wedge-capture-watchdog.md) — "hung git child" lead: dead (re-confirmed ×3).
- [`2026-07-21-global-cli-op-wedge-gc-sink.md`](./2026-07-21-global-cli-op-wedge-gc-sink.md) — "the sink is JSC GC (threads)": wrong; GC threads are ~0 CPU cumulatively. The burn is the **main thread**.
- [`2026-07-21-global-cli-op-wedge-checks-death-spiral.md`](./2026-07-21-global-cli-op-wedge-checks-death-spiral.md) — its **localization is right** (the burn is in code shared by build+check, reached via the checks pass; NOT web-artifacts/rollup) and its working-set profiling stands, but its **mechanism ("memory-pressure paging/GC death-spiral of finite work", ~80%) is refuted** by the measurements below.
- [`2026-07-21-global-cli-op-wedge-inspector-capture.md`](./2026-07-21-global-cli-op-wedge-inspector-capture.md) — the capture methodology + negative repro result this doc's remediation builds on.

**Status: mechanism class identified from live specimens; exact JS line still
unnamed** (bun is stripped; no wedge has yet fired under `--inspect`). The
remediation in this change makes the next field wedge capturable — see
"Pre-armed inspector" below.

## The specimens (all 2026-07-21, all measured live)

| pid | op | worktree | burn | peak footprint | fate |
|---|---|---|---|---|---|
| 91991 | build | po60 | ~1 core | 1.9 GB | killed (morning; doc-3's specimen) |
| 47482 | build | po60 (again) | ~1 core, engaged ~20 min in | 948 MB | killed |
| 91220 | check (push-nested) | m0gj | ~1 core, 13:33u/0:29s | 2.1 GB | killed after **114 min** pending on one check |
| 90778 | check (push-nested) | o0fi | ~1 core, **155+ CPU-min** | **699 MB** | still burning at session end |

## Measured facts (each overturns a prior claim)

1. **The burn is the main thread executing JS.** `ps -M` on three live burners:
   main thread 89–94% CPU; every Bun Pool / Heap Helper / libpas-scavenger
   thread ≈ 0 — including *cumulatively* (the GC threads had ~1s of lifetime
   CPU). Doc-3's GC-thread attribution was a sample-header misread.
2. **Zero paging while burning.** On 90778 over a 5 s window at ~98% CPU:
   `top` faults delta = 0, pageins delta = 0, 657 MB fully resident, host swap
   idle (2 GB unused, compressor quiet). A paging death-spiral *is* faulting —
   this is not one. Doc-4's own `vmmap` (406 MB swapped_out on 47482) shows a
   past balloon parked in swap, untouched.
3. **A big heap is not necessary.** 90778 never exceeded 699 MB peak — under
   every healthy-build baseline — and wedged identically (later readings: 44 MB
   resident, still ~1 core).
4. **The burn outlives the work.** 91220: all 68 other checks `end`ed by
   12:07:47; it then burned ~90% for 114 more minutes with only
   `orphaned-db-tables` outstanding — a check whose total work is one git spawn
   + one pg query (~zero CPU). 47482: **70/70 checks ended, no `done`** —
   `runChecks` itself never returned. There is no finite work the CPU could be
   "slowly" doing. Historical 8–17 h specimens say the same.
5. **The straggler holds nothing.** `lsof` on 91220 and 90778 while "pending":
   **no git child, no pg socket, no pipes**. `orphaned-db-tables`' awaits are
   exactly `Bun.spawn(git) → pool.connect() → pool.query` — child-exit and
   socket completions. Those completion types are starved/lost while **30 s
   heartbeat timers fire punctually** (millisecond-exact over hours). The
   straggler varies across specimens (orphaned-db-tables ×3, no-raw-websocket,
   type-check) — bystanders, not causes. This also refutes the premise of the
   proposed "connect timeout → clean pass" fix (m0gj): there is no in-flight
   connect to time out, and a timeout-to-PASS reprises the fail-open pattern
   doc-1 explicitly reverted (any environmental bound must be `inconclusive`).
6. **One shared code path.** The burning main-thread stack chain is
   byte-identical (load-address-relative offsets
   `…→0x8e7dd0→0x8ed164→0x8ecf40→0x43a040→0x1a2cc0→0x28591a8→0x25e9648→0x31716b8→JIT`)
   across build and check specimens — the shape is event loop → repeating
   native→JS callback → VM entry → JIT'd JS. Two of three burners also show
   heavy *system* time (kevent64 churn); one is ~pure user. bun is stripped —
   `atos` names nothing.
7. **The burn engages mid-op.** The watchdog captured 47482 at 11% CPU 16 min
   in ("idle" verdict); it was at ~90% within the hour. 10 of 11 same-day
   watchdog captures read "idle" only because the 15-min budget fires before
   the burn engages (or on victims).
8. **Fleet gridlock is the amplifier, not the bug.** One culprit pins its
   cpu-slots (and, push-nested, the global push mutex); every other op parks
   idle on flock-wait children with **no lease/deadline**. Six ops were
   simultaneously stuck at the session's worst point.

## Current model

A **self-sustaining, allocating hot loop on the main thread** — a repeating
native→JS callback (stable chain, timers serviced, no syscalls required in one
specimen) — that engages mid-op under **fleet pressure** (load 18–32 during the
incident windows) but **does not need pressure to persist** (fact 2). While it
runs, child-exit and socket-connect completions are never delivered, so
whatever op work is still outstanding freezes as a bystander and the process
can neither finish nor exit. Best candidate class: a bun 1.3.13 event-loop /
GC-activity-timer limit cycle; the JS-visible line is unknown until a wedge is
profiled through the inspector.

Supporting negative result (doc-5): 3-way parallel *real* builds with real slot
admission, uncached, under `--inspect`, ran ~10 clean builds in a low-load
window — same command + concurrency, no ambient pressure, no wedge. The
trigger tracks fleet pressure, and it cannot be summoned on demand.

## Pre-armed inspector (the remediation in this change)

Reproduction is a lottery; field wedges fire several times per hour under real
load. So stop reproducing and make every field wedge capturable:

- `cli/bin/inspect.ts` — op commands (`build`/`check`/`push`) **re-exec once
  under `bun --inspect=localhost:<freeport>/<token>`**. Self-re-exec means the
  wrapper, push's nested check, and the detached build all arm with zero
  per-site wiring; the `--inspect`-in-`execArgv` guard is inheritance-proof.
  Bun pays nothing until a client connects (verified: normal build durations).
  Kill-switch: `CLI_INSPECT_ENABLED` (one constant) or
  `SINGULARITY_CLI_INSPECT=0` per shell. Bind collisions are benign (verified:
  the op runs; only the inspector is lost).
- The op marker (`ops/<op>.json`, `worktree-op.ts`) records the ws URL as
  `inspect`, so the op-wedge watchdog's marker dump names where to connect.
- Capture kit vendored at `plugins/debug/plugins/op-wedge-watchdog/scripts/`:
  `inspector-client.ts` (JSC ScriptProfiler over WebSocket; verified
  end-to-end mid-run: 1838-sample symbolicated profile) and `capture-wedge.sh
  <pid> <ws-url>` (ps/threads, cpu delta, native fingerprint sample, children,
  lsof, progress tail, two spaced 10 s profiles; never kills the specimen).

**Runbook for the next wedge:** watchdog files `cli-op-wedge` → read the
report's marker dump → `capture-wedge.sh <pid> ws://<inspect>` → the profile
names the hot JS function. Methodology caveats (doc-5): no attach-after-launch
(SIGUSR1 **kills** bun), `Debugger.pause` is dead on 1.3.13 (sampling only),
and the inspector dispatches on the JS thread — fine here, since real wedges
demonstrably service timers.

## Remaining structural work (not in this change)

1. **Lease/reclaim on cpu-slots and the push mutex** — one culprit must not
   gridlock the fleet for hours (the victims' 8-children-in-flock signature).
2. **Watchdog re-trip on the idle→spinning transition** — dedupe-once captured
   every culprit *before* its burn engaged; a second capture on a CPU-delta
   flip would catch the burn itself.
3. **Post-banner blind spot** — a build that wedges *after* success clears its
   marker inline (`finalizeBuild(true)`), so the watchdog can't see the
   occurrence-C class; a `build-progress` `done`-plus-live-pid sweep would.
4. **Do not land fail-open timeouts** (see fact 5).
5. Doc-4's working-set diet (`maskSource` split(`""`), bounded check
   concurrency, type-check worker caps) — worth doing for footprint reasons,
   uncoupled from this bug's mechanism.
