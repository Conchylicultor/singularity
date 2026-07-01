# notation

A third `Sonata.Display` lens (beside `piano-roll` and `songsheet`): standard
**sheet-music notation**. It engraves the fully-composed `Score` (transpose,
key inference and spelling already applied by the shell) as a **part → staff →
voice** system — clefs, key/time signatures, barlines, accidentals, rests and
ties — and follows playback with a moving playhead, an active-note highlight,
per-system auto-scroll, and click-to-seek.

## Model: part → staff → voice

The pure converter (`convert.ts`) builds the score in three nested layers, then
the engraver lays them out:

- **Parts** — one per instrument group. The `staffLayout` config chooses the
  mapping: `grand` merges every track onto a single treble/bass grand staff;
  `perTrack` gives each track its own part (one staff, or a grand staff when the
  track's range straddles the split pitch by ≥16 semitones); `auto` groups tracks
  by **instrument** — a per-track key of `gmProgram` (else `instrumentHint`, else
  the track id so unknown instruments never merge). Each `auto` group pools its
  tracks' notes into one part: a solo-piano piece imported as two left/right-hand
  tracks shares one GM program → **one** grand staff (the pitch split + per-clef
  voice separation reconstructs the standard piano engraving), while a true
  ensemble of distinct instruments stays one part per instrument. If `auto`
  yields exactly one group it renders identically to `grand`; multiple groups use
  the per-part staff/grand-staff + bracket logic. Parts are ordered top→bottom by
  descending mean pitch. >1 part → the system is wrapped in a `bracket`; a
  grand-staff part is joined by a `brace`.
- **Staves** — a part owns 1 staff (clef by median pitch) or 2 (treble/bass split
  by `splitPitch`). Every measure carries the same staff shape so the engraver
  stacks/connects uniformly; an empty staff in a bar becomes a whole-measure rest.
- **Voices** — each staff's notes are partitioned into independent melodic lines
  by `voices.ts` (`partitionVoices`). Explicit `Note.voice` numbers are honored
  verbatim; otherwise voices are inferred (interval-graph greedy coloring with a
  pitch-coherence tiebreak), capped at `maxVoicesPerStaff` (default 2, classical
  max 4). A 2-voice staff opposes stems (upper up, lower down). Because a voice
  never staggered-overlaps, the existing run/quantize/decompose machinery —
  **run per voice** — produces clean tied chords with **no re-articulation by
  construction**: a held note in one voice isn't in another voice's note-set, so
  a neighbour's onset can't re-strike it. `separateVoices=false` collapses each
  staff to a single voice (the v1 look).

## Renderer: VexFlow (scoped here)

The engraving is drawn with **VexFlow** (`vexflow`), declared as this plugin's
own dependency — mirroring how `piano-roll` scopes `pixi.js` to itself rather
than hoisting a renderer to the shell. Hand-rolled SVG engraving (beaming,
accidental placement, stems, ledger lines, rest glyphs, collision avoidance) is a
research problem; VexFlow does it to a professional standard and lets us draw
with **theme-token colors** read from CSS vars, so the staff re-skins light/dark.

## Rhythm: adaptive subdivision (tuplets, grace notes, sub-16ths)

The converter does **not** use one fixed 1/16 grid. `web/internal/rhythm.ts`
decides a subdivision **per quarter-note beat** from that beat's true note
**onsets** (not offsets — a release is articulation-noise that would mislabel
ordinary rhythms as tuplets): a 16th grid by default, a 32nd grid when onsets
sit on 32nd positions, or a tuplet (eighth-triplet = 3, sixteenth-sextuplet = 6)
when a tuplet grid *strictly* explains the onsets better than any binary grid.
`buildBarStaff` expands the per-beat plan into a **variable** cell grid; runs
inside a tuplet beat are decomposed in notated in-space beats and tagged with a
tuplet id (consecutive same-id tickables → one VexFlow `Tuplet`), while
`EngTickable.beat/.beats` stay in **real** beats so playhead/seek are unaffected.

`web/internal/grace.ts` is a pre-pass (ahead of voicing) that lifts **grace
notes** out of the stream and attaches each to its principal. A grace is a short
note squeezed *immediately* against a real note — detection walks backward from
each principal collecting a chain of short notes each within half a 32nd of the
next, so a metrically-spaced 32nd (a full 0.125 beat away) never reads as an
ornament. The engraver renders them as a VexFlow `GraceNoteGroup` modifier
(slashed acciaccatura for a lone grace; beamed + slurred for a group).

## Shape (the hard part is pure + tested)

The genuinely hard half — turning polyphonic, beat-based `Score` data into clean
measures — is a **pure, unit-tested** pipeline, kept renderer-free:

- `web/internal/durations.ts` — `decomposeDuration(beats)` splits a beat-length
  into VexFlow notation pieces (`1.5` → one dotted quarter; `1.25` → a quarter
  tied to a sixteenth; down to 32nds), the vocabulary the engraver and rests draw.
- `web/internal/rhythm.ts` — `planWindows(onsets, barStart, barEnd)` → the
  per-beat subdivision plan (16th / 32nd / triplet / sextuplet). Pure + tested.
- `web/internal/grace.ts` — `extractGraces(notes)` → principal-only `mainNotes`
  plus graces keyed by principal id. Pure + tested.
- `web/internal/voices.ts` — `partitionVoices(notes, opts)` splits a staff's
  notes into ordered independent voices (explicit-voice honored first, else
  inferred). Pure + unit-tested.
- `web/internal/convert.ts` — `convert(score, opts)` → an `EngraveModel`:
  ordered measures of `staves` (each a clef + voices of chords/rests/ties), the
  `parts` layout, key/time-signature metadata, and optional chord symbols. Bars
  come from `bars()`; per voice, notes are quantized to a 1/16 grid and walked in
  Q-steps (a *run* = a span where the sounding set is constant) so chords, rests
  and ties fall out by construction.
- `web/components/engrave.ts` — `EngraveModel + width + colors` → VexFlow draws
  N staves × M voices into an SVG host (per-staff Y, brace/bracket connectors,
  opposed stems, optional per-track labels); returns the geometry the component
  follows playback with (beat→x anchors, per-system boxes, tagged note elements).
- `web/components/notation.tsx` — the Display component: measures width via
  `useElementSize`, re-engraves on score/width/theme change, drives the playhead
  and highlight **imperatively** (`useCursorApi().subscribe`, zero re-render per
  frame), and auto-scrolls the active system via `useCursorSelector`.

`capabilities: []` — a reading view that owns its own overlay; it publishes no
shell `Projection`, so the falling-notes overlays / pitch-axis correctly don't
mount here. Config (`config_v2`, registered on web + server): `staffLayout`
(enum auto/grand/perTrack), `separateVoices` (bool), `showChordSymbols` (bool),
`splitPitch` (int, the treble/bass MIDI split). The component drops hidden tracks
(via the `track-mixer` `useHiddenTrackIds` hook) and passes per-track metadata to
`convert` — names (track-mixer override else the score track name) for labels,
plus `gmProgram`/`instrumentHint` from the score's own `tracks` for the `auto`
instrument grouping — while `convert` itself stays pure.

## Resolved (was v1 caveats)

- **True multi-voice + per-track staves.** Each staff is partitioned into
  independent voices with opposed stems; a held note under a moving line stays
  put (no re-articulation) by construction. Tracks map onto staves per
  `staffLayout`; `perTrack` brackets one staff/grand-staff per track.
- **Tuplets, grace notes, sub-16ths** (was the 1/16-grid caveat). Eighth-note
  triplets and sixteenth sextuplets engrave with a bracket + number; 32nd notes
  engrave; grace notes engrave as acciaccaturas / grace groups. See the *Rhythm*
  section. The `seed-rhythm-etude` bundled starter demonstrates all three.

## Remaining caveats / follow-ups

- **Display-voice cap.** A staff shows at most `maxVoicesPerStaff` voices
  (default 2, ≤4). Beyond the cap, an overflow line merges into the nearest-pitch
  voice — re-articulation can reappear only at that dense spot. Configurable later.
- **Treble/bass clefs only.** No alto/tenor C-clefs (viola etc. a follow-up).
- **Tuplet scope.** Only quarter-beat tuplet *windows* (eighth-triplets,
  sixteenth-sextuplets) and ratios 3 / 6. Multi-beat tuplets (quarter-note
  triplet over 2 beats, half-note triplet), other ratios (5 / 7 / 12) and nested
  tuplets are follow-ups (the detector's window set / ratio list extends). A
  tuplet may not span a barline.
- **Grace notes are heuristic.** The Score IR has no grace flag, so a grace is
  inferred (a short note chained hard against a principal). Leading graces only;
  trailing/hanging graces are dropped.
- **Cross-system ties are dropped.** A tie whose two notes land in different
  systems isn't drawn (the within-system tie chain is). Rare; a follow-up.
- **Eager rendering.** All systems engrave at once (so does `songsheet`). If
  profiling shows jank on very long scores, virtualize systems.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Sonata Display: standard staff notation. Engraves the score as a grand staff (treble + bass) with clefs, key/time signatures, barlines, accidentals and rests, following playback with a moving playhead, active-note highlight and auto-scroll. A reading view (no time-axis / pitch-plane capabilities); click a note to seek. Server registration of the notation config (chord-symbol toggle + treble/bass split pitch).
- Web:
  - Contributes: `Sonata.Display` "Notation" → `Notation`, `ConfigV2.WebRegister`, `Sonata.ViewOption` "notation"
  - Uses: `apps/sonata/shell.Sonata`, `apps/sonata/shell.useCursorApi`, `apps/sonata/shell.useSonata`, `apps/sonata/track-mixer.useHiddenTrackIds`, `apps/sonata/track-mixer.useTrackMixerEntries`, `config_v2.ConfigV2`, `config_v2.useConfig`, `primitives/css/center.Center`, `primitives/css/pin.Pin`, `primitives/css/placeholder.Placeholder`, `primitives/css/scroll.Scroll`, `primitives/css/spacing.Inset`, `primitives/css/spacing.Stack`, `primitives/element-size.useElementSize`, `primitives/latest-ref.useLatestRef`, `primitives/syntax-highlight.useDarkMode`
- Server:
  - Uses: `config_v2.ConfigV2`

<!-- AUTOGENERATED:END -->
