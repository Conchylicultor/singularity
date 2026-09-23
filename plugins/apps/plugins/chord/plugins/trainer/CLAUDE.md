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
- `weakestChord(practised, standings)`: the target of the next loop query —
  not mastered first, then the fewest recent answers, then the lowest accuracy;
  ties keep the order given.

## web

`trainerPane` (route `chord-trainer`, segment `""`, `appIndex`) renders
`<SongIndexGate><TrainerScreen/></SongIndexGate>`.

- **Everything comes from the learner's selection** (`useCurriculum`): which
  chords are practised, heard or off, the blanks (one / half / all) and the key
  modes. Until it lands the screen shows its loading state — buttons that are
  about to change would be a claim about what this learner chose.
- **The loop queue** (`useLoopQueue`): the loop on screen is the queue's
  first. When it is the last one left, 10 more are asked for
  (`findLoopsEndpoint`: every chord on — practised and heard — as the chords a
  loop may hold, the key modes, the weakest PRACTISED chord as target, the
  sections of the last 20 loops moved past and of the ones still queued left
  out). Nothing is asked until the progress has loaded, and nothing at all
  while no chord is practised ("No chord is practised"). An empty answer shows
  "No song fits these chords yet" (with Try again), never a blank screen;
  `not-ready` and a failed query show in the same place. **Each queued loop
  carries the target its batch was asked for**, so the round asks about the
  chord the loop was chosen for. **Changing the chords drops the queue**: the
  loops still waiting were drawn from the old chords, so everything behind the
  loop on screen goes and a fresh query runs at once. The loop on screen stays
  (the learner may be mid-answer) unless the new chords cannot hold it — a
  chord in it turned off, or its target no longer practised. The sections
  already played are remembered across the change.
- **Which boxes the round asks about** (`askedPositions`, curriculum): only a
  practised chord's box can be blank; `one` asks the target's last box, `half`
  the practised boxes in the second half, `all` every practised box. The rest
  are **given**: they show their chord in its own colour, dimmed and flat, are
  not click targets before the check, and are never marked right or wrong.
  After the check they replay their stretch of the song like any other box,
  because they are part of the loop. The heading counts asked boxes only
  ("Chord 1 of 2"). **The round's key includes the asked positions**, so
  changing the blanks or the chords mid-round deals the same loop again with
  the new boxes; the round is saved with the blanks it was dealt with.
- **The player** stays mounted from loop to loop (a new video loads in place).
  Browsers block sound until the page is used, so the first loop waits for Play;
  after a Play or a Next every loop starts by itself (`autoplay`).
- **Answer timing** (`useHeardClock`): watches the playhead, one read per
  animation frame while the video plays, and stamps each box the first time its
  chord finishes. Nothing re-renders for it.
- **Keys** (surface-scoped, `useSurfaceShortcuts`; `useChordKeys`): the chord's
  root digit answers (`chordKeyPlan`, so ♭VII is on the 7). A digit several
  practised chords share instead **arms** — those chords light, numbered on their
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
- **After the check**: a box plays its chord — the song's own bars once
  (`controller.playRange`), or the chord struck alone on the piano, whichever
  the piano's sound toggle is on. A chord button, or the "you: IV" tag under a
  wrong box, always plays on the piano (`chordSound(token, tonicPc)`), because
  neither chord need be in the loop at all. The button of the chord sounding now
  is lit.
- **The round is saved once**, by the fill that checks it
  (`recordRoundEndpoint`). A round left before it is checked is never sent.
- **Video reports** (`reportPlaybackEndpoint`): `playing` the first time a
  video plays in the visit; a player error with its code — then a toast says
  the video can't play here, and the trainer drops that loop and every queued
  loop on the same video.
- **The piano** (`piano/web`): `usePiano` is Sonata's default instrument (the one
  `SonataAudio.Instrument` contribution marked `default`, the sampled grand),
  read generically, never by name. One `AudioContext` and one voice set per
  screen, created by the first chord played (inside that click, so it starts
  running, and the samples download only then), disposed on unmount. Each chord
  cuts the one before it. A failure (no default instrument, samples that do not
  load) shows a toast and is rethrown. The screen holds the ONE instance and
  hands `<PianoCard>` a `play` function, so the card's playable keys sound on
  the same context rather than opening a second one.
- **The progress panel** (`ProgressPanel`): today (songs, % right, seconds per
  chord), an all-time line, "Your chords" — the path's step bar for the
  chapter in hand (`<PathProgress>`), then one line per chord that is on, in
  path order (chip, accuracy meter marked at 90 %, accuracy, median time red
  over 2 s, a check once mastered; a chord only heard is dimmed and reads
  "hear only") — and the Path card (`<PathCard>`, curriculum), folded, which
  holds every practice control. The panel builds the path's `standing` from
  `chord.progress` (`byBlanks`); the progress it reads covers every chord on
  and every chord the path names. It is a **plain component, not a DataView**:
  a small fixed status list, not a collection anyone searches, sorts or
  filters. It shows a loading state until `chord.progress` has its first value.
- **The words, and the piano** (`piano/web`): one `songVocabulary(songKey)` and
  one `songKeyTonicPc(songKey)` per loop, so nothing on screen names a chord
  against one key while sounding it against another. Every chord is named — the
  song card carries a key tag, each box a name under its numeral, each button a
  name instead of its function word — and `<PianoCard>` sits under the buttons,
  always. (There used to be a three-valued `reveal` setting gating all of this;
  it is gone, and with it every `| null` name prop.) A box's name follows the
  same `shown` the numeral does, so before the check it names the LEARNER's
  answer and leaks nothing.
  **`shownChord` is the one chord on show**, fed to the lit button and the piano
  together, and it is simply `session.lastPlayed` — the last chord HEARD.
  Everything that sounds a chord writes it: a button, a box, the "you: IV" tag,
  and a `useEffect` on the sounding position, so the playhead crossing into a
  box is just another writer rather than a special case outranking the others.
  That is what lets a chord clicked DURING playback light the keyboard: the
  click is more recent, and holds until the song reaches the next chord. It is
  null before the check **by construction** (nothing writes `lastPlayed` until
  then), which is what stops the keyboard giving the answer away; `lastPlayed`
  is a `RoundSession` field, so the next song clears it with the rest and there
  is no reset to remember.

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
`<ChordNumeral>`, `chord-paint.css`) and the curriculum's Path card (its
chord chips and map rows) draws them too.

## e2e

`e2e/trainer-verify.ts`: the index reaches ready; /chord shows a round whose
heading counts its **asked** boxes (the given ones name themselves, ", given",
which is how the script tells them apart); Play leads to a playback report
(playing or an error — headless Chromium may not play YouTube); every asked box
is filled from the keyboard, using only digits that answer on their own; the
score heading, the saved round, `chord.progress` (one more song, one more
answer per asked box) and the side panel's all-time line are checked.

Then the key tag is parsed back into the key it names, every box label is
checked for a letter name, and the lit keys' `data-pitch` set must equal
`chordSound(token, tonicPc).pitches` computed in the script — the proof that the
picture matches the sound, since the piano plays that same call — with the
doubled bass drawn as the bass (`[data-bass]`) rather than as a fourth chord
tone. Clicking the button to light them also plays it, so the step exercises the
piano.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The Chord trainer screen, the app's index pane (/chord): a real song's loop in an embedded YouTube player, an answer strip with one box per chord on the beat grid, one button per practised chord (keys 1–7), the check with its score, replays of the song over a box and of chords on Sonata's piano, the saved round, the player's playback reports, and the progress panel (today, all time, your chords).
- Web:
  - Slots: `chord-trainer.actions` ← `primitives.pane`
  - Contributes: `Pane.Register` "chord-trainer"
  - Uses:
    - `apps/chord/curriculum.PathCard`
    - `apps/chord/curriculum.PathProgress`
    - `apps/chord/curriculum.StandingLookup`
    - `apps/chord/curriculum.useCurriculum`
    - `apps/chord/piano.PianoCard`
    - `apps/chord/piano.useChordSoundSource`
    - `apps/chord/piano.usePiano`
    - `apps/chord/song-index.SongIndexGate`
    - `apps/chord/vocabulary.ChordNumeral`
    - `apps/chord/vocabulary.chordToneStyle`
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
