# engine

Owns the Web Audio graph (one `AudioContext` + master gain) and the playback
scheduler for the Sonata player. On each `isPlaying → true` transition it
captures a single anchor (`ctx.currentTime` + the cursor beat) and schedules
notes against the audio clock in a bounded, timer-free look-ahead window.

## Engine ↔ control split

The graph is split across two contributions so the volume control's visibility
never touches playback:

- **`AudioEngine`** (`Sonata.Effect`, `components/audio-engine.tsx`) — headless,
  mounted **once** inside `SonataProvider` (in `SonataLayout`) and therefore
  always mounted while the Sonata app is open. Owns the `AudioContext`, master
  gain, the per-track channel strips, the `registerClock` registration, and all
  scheduling.
- **`VolumeControl`** (`sonataPlayerPane.Actions`, `components/volume-control.tsx`)
  — the master-volume slider pinned into the Sonata player pane's header. Owns
  **no** audio.

They communicate through a **per-surface** `audio-store` (`audio-store.ts`, built
on the `scoped-store` primitive): the control writes `volume`, the engine reads
it to drive master gain; the engine also publishes `status` / `loadError` here.
The store's `<Provider>` (`components/audio-provider.tsx`) is folded above the
whole Sonata subtree via the `Sonata.SurfaceProvider` wrapper slot — an ancestor
of both the effect and the toolbar control, which live in different slot branches
— so two open Sonata surfaces have independent volume/status/mute instead of one
module-level singleton bleeding across them.

This is deliberate: the `AudioContext` lifecycle must **not** be tied to any
piece of mountable UI. If the graph lived inside a control that could unmount,
React's cleanup would `ctx.close()` mid-playback and kill all sound. Keeping it
in the always-mounted effect makes the control purely cosmetic.

## Per-track channel strips (instrument + volume)

There is **no global instrument picker** here — the instrument choice and the
fader both live per-track, in the Tracks panel (`track-mixer`). The engine turns
that into audio by keeping **one channel strip per audible track**:

```
track's notes → its InstrumentVoices → its GainNode (the fader) → master → out
```

A strip is `{ gain, voices, instrumentId }` in `channelsRef`, keyed by track id.

**Why per track and not per instrument.** The engine used to keep one voice
manager per *distinct in-use instrument*, shared by every track resolving to it.
That sharing is exactly what made a per-track fader impossible: a shared voice
manager has a single output node, so two piano tracks had one place to put a
level between them, not two. Per-track strips cost N instances of the same
instrument, which is paid for by handing every smplr instrument a shared
`SampleLoader` — it caches decoded buffers by resolved URL, so N instances of
one instrument are still one download and one decode.

**The strip set** is one sorted fingerprint of the `(trackId → instrumentId)`
pairs over tracks that still have audible notes — and the fingerprint is also
the payload, so the reconcile effect reads the pairs back out of it instead of
depending on a Map. That matters because every hook derived from the persisted
track rows (`useTrackInstrumentMap`, `useMutedTrackIds`, `useTrackVolumeMap`)
re-mints its Map or Set whenever *any* field of *any* track row changes — a
fader move included. Keying on identity would rebuild the schedule on every
drag; keying on content changes only when the strip set really does.

**An instrument change re-voices the strip in place.** The old voices are
disposed and the new ones are built into the *same* `GainNode`, because the
fader belongs to the track, not to the instrument. The level — and any glide
still running on it — survives the new timbre. The scheduling rebuild effect
runs in the same commit: it awaits the new instrument's `loaded` promise and
gives a clean `allOff` → dispose → create → re-attack cutover. Reconcile is
declared *before* the rebuild effect, so React runs the rebuild's cleanup
(`allOff`) before reconcile's setup (`dispose`), an ordering the instrument
wrappers' `disposed` guard explicitly tolerates.

**Volume is applied by its own effect, deliberately.** Creating a strip writes
`gain.gain.value` directly — nothing has played through the node yet, so a jump
cannot click. Every later change goes through a separate effect that calls
`setTargetAtTime(target, ctx.currentTime, 0.03)` on the live strips: a short
glide, so a fader moved across a sounding note doesn't step discontinuously.

It is separate because the reconcile effect creates and destroys audio nodes and
the rebuild effect cancels and re-attacks every ringing note — and a level move
is not a reason to do either. **The volume map must never reach either one's
dependency list**: dragging one track's fader would then cut every other track's
sound, the same hazard the tempo jog-wheel fix exists for. Outside its own
effect the map is read through a `useLatestRef`. The fader effect is keyed on a
content fingerprint of the levels *and* on the strip fingerprint, so a strip
created mid-session picks up its current position on the next commit.

**Mute and volume 0 are different mechanisms, on purpose.** Mute removes the
track's notes upstream (`useMutedTrackIds` → `audibleNotes`), so a muted track
has no strip at all: no sample load, no scheduling cost. Volume 0 is just a
fader position on a strip that keeps existing and keeps being scheduled, so
raising it again is instant. Folding volume 0 into the audible set would put the
levels back into the rebuild effect's inputs, which is the one thing this design
is arranged to prevent.

`startScheduling(score, fromBeat, audioAnchor, resolveVoices, ctx, loop)` takes
a per-track resolver, not a single voice manager, and calls
`resolveVoices(note.track)?.schedule(note)`. That resolver is now simply
`channelsRef.current.get(trackId)?.voices` — the scheduler's contract did not
change when the strips did.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Sonata audio engine: schedules the Score's notes against the Web Audio clock on play, routing each note to its track's resolved instrument, with master volume in the player pane's header.
- Web:
  - Contributes:
    - `Sonata.SurfaceProvider` → `AudioProvider`
    - `Sonata.Effect` "audio-engine" → `AudioEngine`
    - `sonataPlayerPane.Actions` "volume" → `VolumeControl`
  - Uses:
    - `apps/sonata/audio/instruments.InstrumentVoices`
    - `apps/sonata/audio/instruments.SonataAudio`
    - `apps/sonata/library.sonataPlayerPane`
    - `apps/sonata/shell.Sonata`
    - `apps/sonata/shell.useCursorApi`
    - `apps/sonata/shell.useSonata`
    - `apps/sonata/track-mixer.useMutedTrackIds`
    - `apps/sonata/track-mixer.useTrackInstrumentMap`
    - `apps/sonata/track-mixer.useTrackVolumeMap`
    - `primitives/css/slider.Slider`
    - `primitives/css/spacing.Stack`
    - `primitives/icon-button.IconButton`
    - `primitives/latest-ref.useLatestRef`
    - `primitives/scope/scoped-store.defineScopedStore`
  - Exports (types):
    - `AudioGraph`
    - `LoopWindowBeats`
    - `ScheduleHandle`
  - Exports (values):
    - `startScheduling`
    - `useAudioGraph`
- Cross-plugin:
  - Imported by:
    - `apps/sonata/audio/live-play`
    - `apps/sonata/audio/metronome`

<!-- AUTOGENERATED:END -->
