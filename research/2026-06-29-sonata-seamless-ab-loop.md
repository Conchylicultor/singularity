# Seamless Sonata A–B practice loop (no audio gap at the wrap)

## Problem

The A–B loop wraps from `B` back to `A` by, inside the rAF transport tick,
bumping `seekEpoch`. That bump re-runs the audio engine's rebuild effect, whose
cleanup calls `allOff()` (hard-killing every committed/queued voice and flushing
smplr's ~200ms internal queue) before `startScheduling` reschedules from `A`.
Between the kill and the first notes of the next iteration reaching the audio
graph there is a brief silence — the audible gap. The visual cursor wraps
seamlessly because it is written imperatively in the same rAF task; only the
audio restart goes through React's async commit + a full teardown.

## Root cause

The wrap is **event-driven through a React state restart** rather than
**pre-scheduled**. Each iteration tears down and rebuilds the Web Audio
schedule. A seamless loop must pre-schedule the next iteration's notes ahead of
the boundary so the scheduler never restarts on a wrap.

## Design

One idea, applied to both sides of the transport: model the loop as a
**deterministic, anchored time-fold** instead of a teardown event. The anchor is
captured once (at play / seek / tempo-change); every later wrap is *computed*,
never *triggered*. Visual and audio share the same loop bounds and the same
fixed anchor, so each iteration adds an identical number of seconds to both —
they stay glued across unlimited iterations with zero re-sync.

### 1. Visual transport (`shell/web/context.tsx`)

Add a pure helper `foldLoopTime(rawSec, window)` (in `score/core`) that folds the
monotonic elapsed score-seconds into the `[A,B)` window, returning the looped
score-seconds and a zero-based iteration count. The rAF tick:

- computes `rawSec` from the (now wrap-stable) anchor,
- folds it through `foldLoopTime` when an enabled loop is set,
- maps `sec → beat` via the tempo index,
- detects a wrap by a change in the returned `iter` and only then passes
  `{ seek: true }` to the cursor store (so the piano-roll re-anchors its onset FX
  rather than spraying every note between `B` and `A`).

The wrap no longer calls `reanchor` or `setSeekEpoch`. `reanchor` resets the
iteration-tracking ref so a fresh anchor restarts the wrap detection.
`seekEpoch` keeps its meaning for *real* seeks (drag, arrows, song reset).

### 2. Audio scheduler (`audio/engine/web/scheduler.ts`)

Replace the one-shot flat `pending` list with a **lazy note generator** over a
single tempo-invariant cumulative-beat coordinate `c`:

- head pass: notes in `[fromBeat, B)` (or all notes if no loop), `c = start − fromBeat`;
- loop iterations `k ≥ 1`: notes in `[A, B)`, `c = (B − fromBeat) + (k−1)(B − A) + (start − A)`.

`when(c) = anchorWhen + pathSec(c) − pathSec(anchorC)`, where `pathSec` integrates
the played path through the tempo index. The pump pulls the generator one event
ahead of the look-ahead horizon and dispatches; for a loop the generator is
infinite, so iterations are scheduled continuously with **no teardown** — the
fix. Memory stays O(1): the generator holds indices, not a materialised tail.

`retime` (the speed jog-wheel) stays seamless and loop-aware: it inverts the
audio clock to the current `c` under the *old* tempo, then re-anchors
`(anchorWhen, anchorC) = (now, cNow)` under the *new* tempo. Already-committed
notes keep their timing; everything past the generation cursor is re-derived.
The no-loop path is algebraically identical to today's behaviour.

### 3. Audio engine (`audio/engine/web/components/audio-engine.tsx`)

Read `loop` from context, pass the active `{start,end}` window to
`startScheduling`, and add a stable loop-bounds signature to the rebuild effect's
deps. Consequences:

- repeated wrap at a stable loop → **no rebuild** (generator pre-schedules) → seamless;
- tempo jog-wheel while looping → **retime** (loop-aware) → seamless;
- toggling the loop on/off, seeking, or dragging the bounds → one rebuild
  (a deliberate edit; a momentary seam there is acceptable and strictly better
  than today, where *every* wrap rebuilt).

## Consistency invariant

Visual `foldLoopTime` and audio `pathSec` wrap at the same `B`→`A` and use the
same bounds + anchor instant + tempo index, so the playhead and sound never
drift across iterations. Re-sync only happens on rebuild/retime, which re-anchor
both sides together.

## Tests

Pure-math unit tests (bun:test): `foldLoopTime` (identity before first wrap,
correct phase + iteration after), and `pathSec`/`pathSecInverse` round-trip
across head + multiple iterations under a varying tempo map.
