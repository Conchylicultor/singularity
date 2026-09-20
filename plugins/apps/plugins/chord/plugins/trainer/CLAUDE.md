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
- **The answer sheet** (`sheet.ts`), pure. `emptySheet(round, asked)` takes the
  positions the learner must name — the curriculum's decision, made outside
  (`asked` empty, out of range or repeated throws). The other boxes are
  **given**: they come already filled with their own chord and cannot be
  selected, cleared or refilled, so the arrows step over them and Backspace
  reaches past them. The first asked box starts selected; a fill writes the
  selected box and moves to the next empty box after it (else the first empty
  one) — always an asked box, since a given one is never empty; the fill that
  leaves none empty checks the sheet, which then never changes. A changed
  answer keeps its last fill's time. `sheetScore` counts asked boxes only, and
  `recordRoundBody` (the body of `POST /api/chord/rounds`) sends only their
  answers, with the given boxes as `givenCount`.
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

- **The palette comes from the curriculum** (`useCurriculum`): the unlocked
  chords, the key modes and the ask rule. Until the standing lands the screen
  shows its loading state — three buttons that are about to become four would
  be a claim about what this learner has.
- **The loop queue** (`useLoopQueue`): the loop on screen is the queue's
  first. When it is the last one left, 10 more are asked for
  (`findLoopsEndpoint`: the unlocked chords, the curriculum's modes, the
  weakest chord as target, the sections of the last 20 loops moved past and of
  the ones still queued left out). Nothing is asked until the progress has
  loaded. An empty answer shows "No song fits these chords yet" (with Try
  again), never a blank screen; `not-ready` and a failed query show in the same
  place. **Each queued loop carries the target its batch was asked for**, so
  the round asks about the chord the loop was chosen for — re-reading the
  weakest chord when the round is built would name a different one, since the
  progress moves in between. **Unlocking drops the queue.** The loops still
  waiting were drawn from the old palette, so a step would otherwise take a
  whole batch to be heard; everything behind the loop on screen goes and a
  fresh query runs at once (the loop on screen stays — the learner may be
  mid-answer). **Undo drops it too**: taking a step back removes a chord, and
  the round on screen was very likely chosen for it, so a round the new palette
  cannot hold goes with the rest rather than asking for a chord the learner no
  longer has. The sections already played are remembered across the change.
- **Which boxes the round asks about** (`askedPositions`, curriculum): the
  chord being practised early on, then the cadence, then the whole loop — and
  always the target alone while it is a chord unlocked ABOVE the level the rung
  was set at and still settling (the curriculum's `askRuleLevel`; a chord the
  learner already had when they paid for the rung is not isolated, or paying
  would change nothing). The rest are **given**: they
  show their chord in its own colour, dimmed and flat, are not click targets
  before the check, and are never marked right or wrong. After the check they
  replay their stretch of the song like any other box, because they are part of
  the loop. The heading counts asked boxes only ("Chord 1 of 2").
- **The player** stays mounted from loop to loop (a new video loads in place).
  Browsers block sound until the page is used, so the first loop waits for Play;
  after a Play or a Next every loop starts by itself (`autoplay`).
- **Answer timing** (`useHeardClock`): watches the playhead, one read per
  animation frame while the video plays, and stamps each box the first time its
  chord finishes. Nothing re-renders for it.
- **Keys** (surface-scoped, `useSurfaceShortcuts`; `useChordKeys`): the chord's
  root digit answers (`chordKeyPlan`, so ♭VII is on the 7). A digit several
  unlocked chords share instead **arms** — those chords light, numbered on their
  buttons, and the next number picks one; Escape drops the pick, and so does
  every other key of the trainer. While a digit is armed **it owns the number
  keys**: the plan's own digit shortcuts stand down and the registered numbers
  are exactly the ones `pickPage` says are in reach, so every number key means
  "the chord I lit", not only the ones that happen to hold a chord themselves.
  Past seven chords on one digit, `pickPage` keeps key 7 as the pager: six in
  reach, the rest one press away, wrapping — so no chord is ever unreachable.
  The hook holds only `{ digit, page }`, derived against the plan, so an undone
  step disarms with nothing to clean up. The clock does not stop for the second
  key: a two-stroke answer costs what it costs. ← / → move, Backspace clears,
  Space plays or pauses, Enter moves to the next song.
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
- **The progress panel** (`ProgressPanel`): `<RevealSwitch/>` first — above the
  `matchResource`, so the setting is usable while the stats are still loading —
  then today (songs, % right, seconds per
  chord), an all-time line, and "Your chords" — the level and the stage being
  worked through, then one line per unlocked chord **in unlock order** (chip,
  accuracy meter marked at 90 %, accuracy, median time red over 2 s, a check
  once mastered), then the locked next step (`<NextStepRow>`). Undo sits beside
  the level: it takes back the last step, not the rounds already played. The
  panel reads "Level N" twice — the level the learner is on, and the one the
  locked row would reach — so the first line is named `Your level`. It is
  a **plain component, not a DataView**: a small fixed status list (the
  unlocked set, a few dozen chords at most), not a collection anyone searches,
  sorts or filters. It shows a loading state until `chord.progress` has its
  first value.
- **Reveal** (`reveal/web`): `useReveal()` says how much of a chord to show.
  With it on, one `songVocabulary(songKey)` per loop names every chord and note
  — the song card grows a key tag, each box a name under its numeral, each
  button a name instead of its function word — and at `keyboard` a card under
  the buttons draws the chord on a piano. A box's name follows the same `shown`
  the numeral does, so before the check it names the LEARNER's answer and leaks
  nothing.
  **`shownChord` is the one chord on show**, fed to the lit button and the card
  together: the playhead's box while the checked loop plays, otherwise
  `session.lastPlayed` (the last chord the learner asked to hear — a button
  after the check, the "you: IV" tag, or a box replay). It is null before the
  check **by construction**, which is what stops the keyboard giving the answer
  away; `lastPlayed` is a `RoundSession` field, so the next song clears it with
  the rest and there is no reset to remember.
- **The locked next step** shows in two places, both from `curriculum/web`:
  `<NextStepPad>` at the end of the button grid (chord steps only — the grid
  has no way to draw a key mode) and `<NextStepRow>` in the panel (every kind).
  Both take `stepReadiness(unlocked, progress)`, which has **three** answers:
  until the standing lands nobody can say whether the learner is ready, so the
  controls wait rather than reading "Add anyway" and taking it back.

### Paint

`web/components/trainer.css` holds the bespoke paint only — box states
(`data-given`, `data-filled`, `data-selected`, `data-mark`, `data-now`,
`data-pop`), the box's name line (`.chord-box-name`), the chord buttons
(`data-lit`, `data-picking`, the dimmed pager badge), meters, the
numeral's display sizes (which the type scale has no rung for, and one of which
follows the box's width through a container query). Layout stays with the
layout primitives: the boxes, ruler ticks, playhead and badges are placed by
runtime numbers (`placedStyle`, a fraction of the window's beats), rows are
`Line` + `Fill`, the page's two tracks are the one raw grid (a container query
at 1000 px, with a named disable).

A chord's own colour and numeral are drawn the same wherever they appear, so
they live with the vocabulary (`vocabulary/web`: `chordToneStyle`,
`<ChordNumeral>`, `chord-paint.css`) and the curriculum's locked step draws
them too. The ghost pad's box (`curriculum/web`) matches `.chord-pad`'s height
and corners so the two sit in one grid.

## e2e

`e2e/trainer-verify.ts`: the index reaches ready; /chord shows a round whose
heading counts its **asked** boxes (the given ones name themselves, ", given",
which is how the script tells them apart); Play leads to a playback report
(playing or an error — headless Chromium may not play YouTube); every asked box
is filled from the keyboard, using only digits that answer on their own; the
score heading, the saved round, `chord.progress` (one more song, one more
answer per asked box) and the side panel's all-time line are checked.

Then reveal is switched to Keyboard (and back): the key tag is parsed back into
the key it names, every box label carries a letter name, and the lit keys'
`data-pitch` set must equal `chordVoicing(token, tonicPc)` computed in the
script — the proof that the picture matches the sound, since the piano plays
that same call. Clicking the button to light them also plays it, so the step
exercises the piano.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The Chord trainer screen, the app's index pane (/chord): a real song's loop in an embedded YouTube player, an answer strip with one box per chord on the beat grid, one button per unlocked chord (keys 1–7), the check with its score, replays of the song over a box and of chords on Sonata's piano, the saved round, the player's playback reports, and the progress panel (today, all time, your chords).
- Web:
  - Slots: `chord-trainer.actions` ← `primitives.pane`
  - Contributes: `Pane.Register` "chord-trainer"
  - Uses:
    - `apps/chord/curriculum.NextStepPad`
    - `apps/chord/curriculum.NextStepRead`
    - `apps/chord/curriculum.NextStepRow`
    - `apps/chord/curriculum.stepReadiness`
    - `apps/chord/curriculum.StepReadiness`
    - `apps/chord/curriculum.useCurriculum`
    - `apps/chord/curriculum.useNextStep`
    - `apps/chord/curriculum.useUndoStep`
    - `apps/chord/curriculum.useUnlockStep`
    - `apps/chord/reveal.RevealKeyboardCard`
    - `apps/chord/reveal.RevealSwitch`
    - `apps/chord/reveal.useReveal`
    - `apps/chord/song-index.SongIndexGate`
    - `apps/chord/vocabulary.ChordNumeral`
    - `apps/chord/vocabulary.chordToneStyle`
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
    - `primitives/css/ui-kit.ControlSizeProvider`
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
