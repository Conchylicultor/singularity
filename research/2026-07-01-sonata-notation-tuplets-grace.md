# Sonata notation lens — tuplet, grace-note & sub-16th support

Follow-up to `research/2026-06-30-sonata-notation-lens.md`. Removes the standing
caveat: *"1/16 quantization. Tuplets (triplets), grace notes and sub-sixteenth
ornaments are approximated or dropped."*

> **Status: implemented.** Two refinements landed during implementation vs. this
> plan: (1) subdivision detection keys on **onsets only** — voting note offsets
> mislabeled ordinary gated rhythms as tuplets — and the binary grid targets a
> 1/16 *real* cell width (32nd only when onsets demand it); (2) grace detection
> keys on **immediacy** (a backward-chained gap < half a 32nd), not just
> duration, so a 32nd-run note is never mistaken for a grace. A `seed-rhythm-etude`
> starter demonstrates all three features; the MIDI seeder was made
> content-hash-aware so editing a starter re-mints it.

## Problem

The notation lens quantizes every note onset/duration to a fixed **1/16 grid**
(`Q = 0.25` quarter-beats) in `web/internal/convert.ts`:

- `quantize(x) = round(x/Q)*Q` snaps starts/ends.
- `buildBarStaff` divides the bar into uniform `Q` cells, groups consecutive
  cells with an identical sounding-note set into *runs*, and feeds each run's
  length to `decomposeDuration` (a greedy largest-first split over a table whose
  smallest entry is a 16th).

Consequences on the fixed binary grid:
1. **Tuplets** (triplet 8ths at 1/3-beat onsets, sextuplet 16ths, …) snap to the
   nearest 16th → wrong onsets, wrong durations, no bracket/number.
2. **Sub-sixteenth** values (32nds) collapse to 16ths or vanish.
3. **Grace notes** — a very short note whose quantized length rounds below a 16th
   — are dropped outright by `buildSegs` (`if (qe - qs < Q - EPS) continue`).

The `Score` IR carries this faithfully already: `Note.start`/`Note.duration` are
floating quarter-beats (MIDI import = `ticks/ppq`), so a triplet lands at ≈k/3
and a grace note is a ~0.05–0.1-beat note just before its principal. The data is
there; only the engraver throws it away.

## Design overview

One unifying idea for tuplets **and** sub-16ths: replace the single global 16th
grid with a **per-beat adaptive subdivision**. Grace notes are an orthogonal
pre-pass. Three pure, unit-tested modules feed two new `EngTickable` fields that
the VexFlow engraver renders.

```
Score ─► grace pre-pass ─► voice partition ─► per-bar/voice:
                                                subdivision detect (rhythm.ts)
                                                → variable-grid runs+decompose
                                                → EngTickable[] (+tuplet/+grace)
                                              ─► engrave.ts → VexFlow Tuplet + GraceNoteGroup
```

### 1. Adaptive subdivision (new `web/internal/rhythm.ts`, pure + tested)

Today `buildBarStaff` walks **uniform** `Q` cells. Generalize to a **variable
cell list** whose boundaries come from a per-window subdivision decision.

- **Window** = one quarter-note beat (length `1.0`), aligned to integer beat
  offsets from the bar start. (A quarter beat is the tuplet unit for the common
  cases: eighth-triplet = 3 per beat, sixteenth-sextuplet = 6 per beat, 32nds =
  8 per beat.) The tail window of an odd bar is shorter; handled generically.
- For each window, collect the in-voice segment **onsets and offsets** that fall
  inside it, as fractions in `[0,1]` of the window length.
- **Candidate subdivisions** `S`:
  - binary: `1, 2, 4, 8` (whole-beat, 8th, 16th, 32nd cell density)
  - tuplet: `3` (eighth-triplet), `6` (sixteenth-sextuplet)
  - (12 = 32nd-triplet and 5/7 = quintuplet/septuplet are a documented follow-up)
- For each `S`, error = Σ over each fraction of `dist(frac, nearest k/S)`.
- **Choose** the coarsest binary `S_bin` with error ≤ `TOL`; the coarsest tuplet
  `S_tup` with error ≤ `TOL`. Prefer binary — pick the tuplet **only when it
  strictly explains the onsets better** (`S_tup` error + `MARGIN` < `S_bin`
  error, i.e. binary genuinely can't represent them). This bias stops ordinary
  rhythms from being mislabeled triplets. Empty window → binary `S=1`.
- Output per window: `{ start, len, cells: S, tuplet?: { num, inSpace } }`
  where `inSpace` = largest power of two ≤ `num` (3→2, 6→4). Binary → no tuplet.

**Variable-grid runs.** `buildBarStaff` is refactored to consume the window plan
instead of a uniform cell count:
- Concatenate every window's cells into one ordered **cell-boundary list** (cells
  have variable width = `len/cells`).
- **Run-groups**: each tuplet window is its own group; maximal runs of
  consecutive binary windows coalesce into one group (so a half note spanning two
  binary beats stays a single note, never two tied quarters).
- Within a group, keep the existing algorithm: per-cell sounding-id set →
  maximal same-set runs → decompose.
  - **Binary group:** `decomposeDuration(runBeats)` unchanged (extended table, §3).
  - **Tuplet group:** measure length in **notated base-note units** (1 base note =
    `len/num` real beats, notated as the value that fits `inSpace` per window —
    8th for `3`, 16th for `6`). A run of `c` cells → `decomposeDuration(c *
    baseNotatedBeats)` (e.g. 2 cells of a triplet = a notated quarter; 1 cell =
    an 8th), and every emitted tickable is tagged with the window's tuplet id so
    the engraver wraps the group. Rests inside a tuplet carry the id too.

The `EngTickable.beat`/`.beats` fields stay in **real** beats (playhead, seek and
highlight keep working unchanged); only the *notated* duration token differs
inside a tuplet.

### 2. Grace notes (new `web/internal/grace.ts` pre-pass, pure + tested)

Before voice-partitioning/quantization, extract grace notes so they neither
distort voicing nor get dropped:

- A note `g` is a **grace** iff `g.duration < GRACE_MAX` (≈ a 32nd, e.g. `0.13`
  beats) **and** a principal note `p` (normal length) in the same track starts
  within `[g.start − ε, g.start + GRACE_MAX]` — i.e. `g` immediately
  precedes/collides with a real onset. Consecutive graces before the same `p`
  form one grace group (ordered by start).
- Emit `graceByPrincipalId: Map<principalId, GraceSpec[]>`, remove graces from
  the note stream fed downstream. `GraceSpec = { key: string; alter: number;
  duration: string /* "8"|"16" */; }`; a lone grace → acciaccatura (`slash:
  true`), multiple → plain slurred group.
- After tickables are built, attach a principal's graces to the tickable whose
  run **begins** that principal (matched by `beat ≈ quantized principal start`).
  A grace with no resolvable principal in-bar is dropped (documented, rare).

### 3. Sub-sixteenth vocabulary (`web/internal/durations.ts`)

Extend `TABLE` with 32nd values so `decomposeDuration` can emit them:
`{ "16" dotted 0.375 }` already exists; add `{ "32" dotted, 0.1875 }` and
`{ "32", 0.125 }`. `decomposeDuration` stays grid-agnostic: it splits whatever
beat-length it's handed. `Q` stays `0.25` **only as the binary fallback** — the
adaptive detector drives real resolution now.

### 4. Engraver (`web/components/engrave.ts`)

- **Tuplets:** after building a voice's `StaveNote[]`, group consecutive tickables
  sharing `tuplet.id`; for each group `new Tuplet(groupNotes, { num_notes: num,
  notes_occupied: inSpace, bracketed: true, ratioed: false })`. Store, and after
  `voice.draw` + beams, `tuplet.setContext(ctx).draw()`. Beaming still comes from
  `Beam.generateBeams` over the flat note list (VexFlow beams tuplet notes fine).
- **Grace notes:** for a tickable with `graceNotes`, build `GraceNote`s (`{ keys,
  duration, slash }`), `new GraceNoteGroup(graceNotes, showSlur)`, apply grace
  accidentals, and `principalStaveNote.addModifier(group, 0)` **before**
  formatting so widths reserve room. Grace notes are modifiers — excluded from the
  main `Voice` tick total.

`EngTickable` gains:
```ts
tuplet?: { id: string; num: number; inSpace: number };
graceNotes?: { keys: string[]; alters: number[]; duration: string; slash: boolean }[];
```

## Testing

- `rhythm.test.ts` — triplet onsets `{0, 1/3, 2/3}` → `S=3` tuplet; clean 16ths →
  `S=4` binary (not mislabeled); 32nds `{0,1/8,…}` → `S=8`; a swung/loose
  triplet within `TOL` still detected; near-binary noise stays binary.
- `durations.test.ts` — 32nd + dotted-32nd decompositions.
- `grace.test.ts` — one/several graces attach to the right principal; a normal
  short note (not preceding a principal) is **not** treated as grace.
- `convert.test.ts` — end-to-end: a score with an eighth-triplet beat yields 3
  tickables tagged one tuplet `{num:3,inSpace:2}` with notated `"8"`; a grace
  note yields `graceNotes` on its principal; a 32nd yields a `"32"` tickable;
  real beats preserved for playhead.
- Engraver is renderer-only (no unit test): verify by screenshot on a
  triplet/grace-bearing MIDI song.

## Scope / non-goals (documented follow-ups)

- Only quarter-beat tuplet **windows**: eighth-triplets, sixteenth-sextuplets,
  32nds. **Multi-beat tuplets** (quarter-note triplet over 2 beats, half-note
  triplet) and sub-beat tuplet units are additive later (extend the window set).
- Tuplet ratios limited to `3` and `6`; `5/7/12` are a follow-up (same detector).
- Nested tuplets unsupported.
- A tuplet may not span a barline (as with plain runs today).
- Grace notes only *before* a principal (leading); trailing/hanging graces drop.

## Why this shape (clean, not a patch)

- The adaptive subdivision is the **one** structural mechanism that fixes both
  tuplets and sub-16ths; it subsumes the old fixed grid (binary `S` = the old
  behavior) rather than special-casing.
- `rhythm.ts` / `grace.ts` are pure & unit-tested, matching the existing
  renderer-free pipeline discipline (`durations.ts`, `voices.ts`).
- Real-beat `EngTickable.beat/.beats` are untouched, so playhead/seek/highlight
  and the whole `engrave` geometry contract keep working with only additive
  fields.
</content>
