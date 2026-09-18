# trainer

The Chord training loop: the round model (`core`) and the trainer screen, the
app's index pane at `/chord` (`web`). Design:
`research/2026-09-18-apps-chord-trainer-app.md` ("How a round works"); look:
the prototype `proto-1789461303-updb` at its default options.

## core

- `roundFromCandidate(candidate, { videoDurationSeconds })` turns a
  `find` loop candidate into a round: the loop in video seconds, the beat grid,
  and one answer box per sounding chord of the window. A chord ringing in from
  before the window, or running past its end, is clipped to it; a rest is a gap
  with no box; a repeated chord is two boxes, never merged (user decision).
  The boxes use the index's own overlap rule (`chordOverlapsWindow`), and a
  count different from the window's `chordCount` throws.
- A video-fraction alignment needs the video's length: the player's when it has
  loaded (it wins), else the candidate's. With neither, the result is
  `needs-duration`. An alignment of `none` throws: `find` never returns one.
- Answer time: a box's clock starts the first time its chord finishes sounding
  in the round; `clampAnswerMs` bounds the time to 0.3–30 s.
- **The answer sheet** (`sheet.ts`), pure: the first empty box starts selected;
  a fill writes the selected box and moves to the next empty box after it (else
  the first empty one); ← / → move; Backspace clears the box, or the one before
  it when it is empty; the last fill checks the sheet, which then never changes.
  A changed answer keeps its last fill's time. `recordRoundBody` is the body of
  `POST /api/chord/rounds`; `sheetScore` the heading's numbers.
- **When a chord has finished sounding** (`heard.ts`): `finishedBoxes(boxes,
  prev, next)` between two playhead reads — a forward move finishes every box
  whose end it crosses (within 50 ms), a jump back (the loop wrapping) finishes
  the box it cut off within 0.3 s of its end. A box filled before its chord
  finished counts the minimum, 0.3 s.
- `weakestChord(unlocked, standings)`: the target of the next loop query —
  not mastered first, then the fewest recent answers, then the lowest accuracy;
  ties keep the unlocked order.

## web

`trainerPane` (route `chord-trainer`, segment `""`, `appIndex`) renders
`<SongIndexGate><TrainerScreen/></SongIndexGate>`.

- **The loop queue** (`useLoopQueue`): the loop on screen is the queue's
  first. When it is the last one left, 10 more are asked for
  (`findLoopsEndpoint`: the starting chords, major, the weakest chord as
  target, the sections of the last 20 loops moved past and of the ones still
  queued left out). Nothing is asked until the progress has loaded. An empty
  answer shows "No song fits these chords yet" (with Try again), never a blank
  screen; `not-ready` and a failed query show in the same place.
- **The player** stays mounted from loop to loop (a new video loads in place).
  Browsers block sound until the page is used, so the first loop waits for Play;
  after a Play or a Next every loop starts by itself (`autoplay`).
- **Answer timing** (`useHeardClock`): watches the playhead, one read per
  animation frame while the video plays, and stamps each box the first time its
  chord finishes. Nothing re-renders for it.
- **Keys** (surface-scoped, `useSurfaceShortcuts`): 1–7 answer by scale degree
  (only the unlocked chords' keys), ← / → move, Backspace clears, Space plays or
  pauses, Enter moves to the next song.
- **After the check**: a box replays the song over that box once
  (`controller.playRange`), then the loop goes on; a chord button, or the
  "you: IV" tag under a wrong box, plays that chord on the piano in the song's
  key (`chordVoicing(token, round.keyTonicPc)`); the button of the chord
  sounding now is lit.
- **The round is saved once**, by the fill that checks it
  (`recordRoundEndpoint`). A round left before it is checked is never sent.
- **Video reports** (`reportPlaybackEndpoint`): `playing` the first time a
  video plays in the visit; a player error with its code — then a toast says
  the video can't play here, and the trainer drops that loop and every queued
  loop on the same video.
- **The piano** (`usePiano`): Sonata's default instrument (the one
  `SonataAudio.Instrument` contribution marked `default`, the sampled grand),
  read generically, never by name. One `AudioContext` and one voice set per
  screen, created by the first chord played (inside that click, so it starts
  running, and the samples download only then), disposed on unmount. Each chord
  cuts the one before it. A failure (no default instrument, samples that do not
  load) shows a toast and is rethrown.
- **The progress panel** (`ProgressPanel`): today (songs, % right, seconds per
  chord), an all-time line, and "Your chords" — one line per unlocked chord:
  chip, accuracy meter marked at 90 %, accuracy, median time (red over 2 s),
  and a check once mastered. It is a **plain component, not a DataView**: a
  small fixed status list (the unlocked set, a few dozen chords at most, in the
  curriculum's order), not a collection anyone searches, sorts or filters. It
  shows a loading state until `chord.progress` has its first value.

### Paint

`web/components/trainer.css` holds the bespoke paint only — tile colours,
box states (`data-filled`, `data-selected`, `data-mark`, `data-now`,
`data-pop`), the chord buttons, meters, the numeral's display sizes (which the
type scale has no rung for, and one of which follows the box's width through a
container query). Layout stays with the layout primitives: the boxes, ruler
ticks, playhead and badges are placed by runtime numbers (`placedStyle`, a
fraction of the window's beats), rows are `Line` + `Fill`, the page's two
tracks are the one raw grid (a container query at 1000 px, with a named
disable).

Colours read the chord theme: `chordToneStyle(token)` sets `--fn` (the
degree's `--categorical-N`, or `--categorical-10` outside the scale) and
`--fn-depth`; `.chord-tone` derives the solid tile (`--fn-bg`, the colour
deepened toward black in OKLCH) and the numeral on it (`--fn-ink`).

## e2e

`e2e/trainer-verify.ts`: the index reaches ready; /chord shows a round whose
heading counts its boxes; Play leads to a playback report (playing or an
error — headless Chromium may not play YouTube); every box is filled from the
keyboard; the score heading, the saved round, and `chord.progress` (one more
song, one more answer per box) and the side panel's all-time line are checked.


<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The Chord trainer screen, the app's index pane (/chord): a real song's loop in an embedded YouTube player, an answer strip with one box per chord on the beat grid, one button per unlocked chord (keys 1–7), the check with its score, replays of the song over a box and of chords on Sonata's piano, the saved round, the player's playback reports, and the progress panel (today, all time, your chords).
- Web:
  - Slots: `chord-trainer.actions` ← `primitives.pane`
  - Contributes: `Pane.Register` "chord-trainer"
  - Uses:
    - `apps/chord/song-index.SongIndexGate`
    - `apps/sonata/audio/instruments.InstrumentVoices`
    - `apps/sonata/audio/instruments.SonataAudio`
    - `infra/endpoints.useEndpointMutation`
    - `integrations/youtube.useYouTubePlayer`
    - `integrations/youtube.useYouTubePlayerState`
    - `integrations/youtube.useYouTubePlayhead`
    - `integrations/youtube.YouTubePlayer`
    - `integrations/youtube.YouTubePlayerController`
    - `primitives/css/card.Card`
    - `primitives/css/center.Center`
    - `primitives/css/clip.Clip`
    - `primitives/css/coords.pct`
    - `primitives/css/coords.placedClasses`
    - `primitives/css/coords.placedStyle`
    - `primitives/css/fill.Fill`
    - `primitives/css/grid.Grid`
    - `primitives/css/inline.Inline`
    - `primitives/css/line.Line`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/yield.yieldClass`
    - `primitives/latest-ref.useEventCallback`
    - `primitives/latest-ref.useLatestRef`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
    - `primitives/overlay/tooltip.Kbd`
    - `primitives/pane.defineRoute`
    - `primitives/pane.Pane`
    - `primitives/shortcuts.useSurfaceShortcuts`
    - `shell/toast.showToast`
- Core:
  - Uses:
    - `apps/chord/song-index.beatTimesAlignment`
    - `apps/chord/song-index.BeatTimesAlignment`
    - `apps/chord/song-index.beatToSeconds`
    - `apps/chord/song-index.chordOverlapsWindow`
    - `apps/chord/song-index.ChordToken`
    - `apps/chord/song-index.LoopCandidate`
    - `apps/chord/song-index.LoopShapeId`
    - `apps/chord/song-index.resolveVideoFraction`
    - `integrations/hooktheory.hookpadTonicPc`
  - Exports (types):
    - `AnswerSheet`
    - `Box`
    - `Round`
    - `RoundResult`
    - `SheetScore`
  - Exports (values):
    - `ANSWER_MS_MAX`
    - `ANSWER_MS_MIN`
    - `boxAt`
    - `clampAnswerMs`
    - `clearBackward`
    - `emptySheet`
    - `fillSelected`
    - `FINISH_EPSILON_S`
    - `finishedBoxes`
    - `gridBeatAt`
    - `moveSelection`
    - `recordRoundBody`
    - `roundFromCandidate`
    - `selectBox`
    - `sheetScore`
    - `weakestChord`
    - `WRAP_TOLERANCE_S`

<!-- AUTOGENERATED:END -->
