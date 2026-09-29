# Sonata — align an Ultimate Guitar sheet to its YouTube recording

High-level vision. It fixes the goal, the architecture, the two contracts
between the parts, and the three task sessions. **The details are left to
each task's agent**: models, libraries, file layout, UI and tuning. Each task
starts with its own investigation and writes its own plan doc next to this one.

Track page: "Chord song player" (`block-ae1856e8-b9ac-4176-811e-ae4600260b51`),
approach 3 of the agent card there.

## Context

Goal: play a song's chord progression live over its YouTube recording, so
the user can follow it or play along.

Sonata can already import an Ultimate Guitar (UG) chord sheet
(`plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar`): URL
paste or catalog search → `parseUgTab` → `compile()` → `Score`. UG ships no
timing, so `compile()` **invents** one: synthesized 4/4 at a default tempo, bars
estimated from lyric length. The chords are right. When they happen is a guess.

Alignment replaces that guess with the real timing of a real recording. The
sheet's chord sequence stays fixed and only its timing is worked out, so
accuracy is as good as the sheet, and every chord change lands on a beat of
the recording.

Legal posture (already the UG source's): a personal-instance feature. The user
pulls one sheet into their own instance, and nothing crawls. Downloaded audio
is a transient analysis cache, never served or shared.

## End-to-end experience (v1)

1. The user imports a UG sheet (existing flow).
2. With no further input, a background job finds the recording on YouTube,
   downloads its audio, analyses it and aligns the sheet to it.
3. The song opens with the YouTube video as its clock: the songsheet, piano
   roll and loop follow the real recording. The synth can play along or be muted.
4. The user sees which video was chosen, and how confident the alignment is,
   and can **Change video** (paste a URL → re-align). When nothing aligns well,
   the song says "needs a video" rather than guessing.

## Architecture

```
UG sheet ──────────────────────────────────────────┐
                                                    ▼
YouTube ─► [A] audio fetch ─► [A] beat + chroma ─► [B] aligner ─► alignment record ─► compile() ─► Score
  ▲            (yt-dlp)        (Python sidecar)     (TS, pure)    (side-table)         (tempoMap from beats)
  │                                                                                        │
[C] video resolution ◄── alignment score picks the candidate        [C] YouTube clock ◄───┘
```

Principles:

- **The `Score` stays the narrow waist.** An aligned song is an ordinary
  `Score`. `Score.tempoMap` is already a list of tempo changes (not one fixed
  bpm), so a detected beat grid becomes one tempo event per beat. Every display,
  loop, transpose and voicing works unchanged. No display learns about "alignment".
- **Stored alignment, derived Score.** The alignment is its own stored record
  on the song, beside the stored UG tab. `compile()` reads it when present and
  falls back to today's invented timing otherwise. Re-aligning never touches
  the sheet, and editing the sheet re-runs the alignment rather than
  corrupting it.
- **Heavy audio work is out of process.** A Python sidecar run as a supervised
  job (`infra/jobs/supervised-job`), never in the backend's event loop.
  Features are cached per `videoId`, so re-aligning (a sheet edit, a different
  candidate) never re-analyses the audio.
- **Decoding is pure TypeScript.** The aligner is a pure function from
  (features, sheet) to alignment. It is unit-testable on fixtures, with no
  Python, and cheap enough to re-run on every sheet edit.
- **The sidecar is generic.** The audio pipeline is shared infrastructure for
  every audio-understanding feature (the Chord app, later free transcription,
  stems, lyric timing), not a Sonata detail.
- **Failure is a state.** "Not aligned yet", "aligning", "aligned (confidence)",
  "needs a video" and "failed (why)" are distinct states the UI renders. Never an
  invented timing presented as a real one.

## The two contracts

These are the seams between the tasks. Each task may refine the exact fields,
but must keep their shape and meaning, and record any change here.

**1. Beat features**: produced by A, consumed by B. Per analysed recording
(keyed by `videoId`):

- the beat times (seconds) and which beats are downbeats;
- per beat, a 12-bin chroma vector (plus a bass chroma, for inversions and
  roots);
- the audio duration, and the analysis version (so a better model triggers a
  re-analysis instead of mixing old and new results).

**2. Alignment record**: produced by B, consumed by B's `compile()` and by C.
Per song:

- the `videoId` it is aligned to, plus the beat grid it used;
- the transposition found (the capo offset between the sheet and the recording);
- for each sheet chord occurrence, the beat it starts on. Repeated sections
  (a "Chorus x2") are expanded into their real occurrences, and passages the
  sheet omits are marked as gaps;
- a confidence per bar and an overall score (the score is what C compares
  candidates with).

## Tasks

Three sessions, run in order A → B → C. C's player half depends on nothing,
so it can start early on the guessed timing if parallelism is wanted.

### A — Audio pipeline

Get from a `videoId` to cached **beat features**.

- A `uv`-managed Python environment provisioned at install time (see
  `framework/tooling/provision`), and a way to run a Python entrypoint as a
  supervised job with JSON in and out. Models are cached in a data dir.
- yt-dlp: download a video's audio into a cache keyed by `videoId`, bounded by
  a retention sweep.
- Beat/downbeat tracking and per-beat chroma (candidates: Beat This!, madmom,
  allin1, librosa, a learned chroma model; the agent's choice, justified).
- Likely home: a new `infra/audio-analysis` umbrella (sidecar runtime + feature
  extractors), with the YouTube download beside `integrations/youtube`.
- To investigate: CPU vs Apple-silicon GPU (MPS) cost, install footprint (torch), and whether one
  environment serves every future extractor.
- Done when: features for 3–4 reference songs exist, and the beat grid checks out by ear.

### B — Aligner + Sonata integration

Get from (features, UG sheet) to an aligned `Score`.

- The aligner: a left-to-right HMM over the sheet's chord sequence, scored
  per beat against chord templates, decoded with Viterbi. It searches all 12
  transpositions, allows section repeats and jumps at section tags, has a
  filler state for passages the sheet omits, snaps to beats, and outputs
  per-bar confidence. Prior work: McVicar et al. 2011 ("jump alignment"),
  Mauch, Fujihara & Goto 2012.
- Storage of the alignment record per song (a side-table via
  `infra/entity-extensions`, like the UG tab's own
  `sonata_songs_ext_ultimate_guitar`).
- `compile()` builds the `tempoMap` and chord positions from the record when
  present. A job chains fetch → features → align after an import or a sheet
  edit, and the status is visible in the player.
- Likely home: `sonata/sources/ultimate-guitar/plugins/alignment`.
- Done when: a UG song with a hand-pasted YouTube link opens with chords on
  the recording's beats, and the aligner's unit tests cover repeats,
  transposition and an omitted section.

### C — Video: play and pick

Make the video both the clock and automatic.

- **Play:** an embedded YouTube player (`integrations/youtube`) as Sonata's
  playback clock (the shell's `registerClock`): play, pause, seek and the A/B
  loop stay in sync, with a mix control (video volume, synth on/off).
- **Pick:** automatic video resolution.
  - Candidates come from a YouTube search (yt-dlp search; the YouTube Data API
    later) and from the Hooktheory song index (about 26k songs with a video
    aligned by a human). The Hooktheory lookup is read through a neutral shared
    lookup, never by Sonata importing `apps/chord`.
  - Ranking prefers "Artist - Topic" (studio audio) > "Official Audio" >
    "Official Video", penalises titles marking a different recording (live,
    cover, remix, sped up…), fuzzy-matches the title and channel, and drops
    videos that can't be embedded (reuse `apps/chord/video-availability`'s
    oEmbed check, or lift it into shared code).
  - The alignment score decides: align the top candidate, and move to the next
    only when its score is low. If none fits, the song says "needs a video".
    **Change video** overrides.
- Done when: 10 songs imported with no video given, reporting how many landed on
  the right recording and how the synth sounds against it by ear.

## Out of scope for v1 (follow-ups)

- Lyric anchors (Whisper word timestamps on a vocal stem) where chroma is ambiguous.
- Flagging where the sheet disagrees with a free transcription of the audio.
- Hooktheory sections as trusted seeds, and a record of each bar's source
  (hooktheory / aligned / inferred).
- A hand editor for nudging chord positions.
- Audio sources other than YouTube (local files).

## Verification (whole feature)

After C: import 10 varied UG songs (pop, a song with a key change, a song with a
capo, a sparse acoustic one) with no video given. For each, record the video
chosen, the overall score, and a by-ear check with the synth over the
recording. Sparse arrangements, distorted guitar and heavily simplified sheets
are the expected weak spots.
