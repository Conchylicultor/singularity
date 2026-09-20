# vocabulary

What the Chord trainer says about a chord token (`"7:4-3-3/1"`, see
`song-index/core/token.ts`), and how one is drawn. Design:
`research/2026-09-18-apps-chord-trainer-app.md`.

```ts
// core/ — pure
chordLabel(token)        → { numeral, suffix, figure, text }   // "V" "" "65" "V65"
chordDegree(token)       → 0..6 | null                          // major-scale degree of the root
chordFunction(token)     → "tonic" | "subdominant" | "dominant" | null
chordDigit(token)        → "1".."7"                             // the root's LETTER degree: ♭VII → 7
chordKeyPlan(unlocked)   → { digit, tokens[] }[]                // digits ascending, tokens in unlock order
pickPage(tokens, page)   → { numbers, pager }                   // the second stroke, paged past seven
chordVoicing(token, tonicPc) → MIDI notes, ascending            // the chord itself
chordSound(token, tonicPc)   → { bass, voicing, pitches }       // + its doubled bass
songKeySignature(key)    → KeySignature                         // D dorian → C major
songKeyLabel(key)        → "G major", "E♭ mixolydian"
songKeyTonicPc(key)      → 0..11
songVocabulary(key)      → { nameChord, noteName }              // "D7", "D/F♯", "A♭"

// web/ — the one drawing of a chord
<ChordNumeral token/>    // the numeral, its mark and figure raised beside it
chordToneStyle(token)    // --fn / --fn-depth, which .chord-tone reads
```

## Naming

A token is already relative to the tonic, so it is named as Sonata's
`romanNumeral` names a chord in C major (`sonata/plugins/theory/core`): the
root's degree picks the numeral, with Sonata's conventional reading of a
chromatic root (`♭II ♭III ♯IV ♭VI ♭VII`), and the quality its case and mark.
The stack is matched against Sonata's `CHORD_TEMPLATES` exactly.

- **Inversion figure**: `6` / `64` for a triad, `65` / `43` / `42` for a
  seventh chord, whose suffix then drops its `7` (`V65`, `viiø65`, `Imaj65`).
  Any other chord (sus, sixths, ninths, a spelled stack) names its bass by
  scale degree: `Vsus4/1`.
- **A stack Sonata has no quality for** is still labelled, never refused: the
  numeral (lowercase when it has a minor third and no major one), then each
  tone above the root as a chord member: `I(3,5,9)`, `I(5)`.
- **The inversion counts tones from the bottom of the stack.** A token keeps
  the root-position stack but not which chord degree each tone is; an
  inversion past the top (a seventh with no 5th, in third inversion) puts the
  top tone in the bass. `chordVoicing` reads it the same way.

`chordDegree` and friends read only the root against the major scale; the
function families follow the mockup (I iii vi tonic, ii IV subdominant, V vii
dominant).

## The song's key, and a chord's name in it

The numeral says what a chord DOES (`V7`); the name says what it IS in this
song (`D7`). Naming takes the key, which a loop window gives as a tonic
spelling (`"Bb"`) and one of Hookpad's nine modes.

Sonata's `KeySignature` is major or minor only, so a Dorian key has no direct
spelling in it — but a modal key's *signature* is its relative major's, and the
signature is all a speller reads. `songKeySignature` is that translation: the
tonic's place on the circle of fifths plus the mode's offset (lydian +1, major
0, mixolydian −1, dorian −2, minor −3, phrygian −4, locrian −5), read back as a
major tonic. D dorian is written in C major; E♭ mixolydian in A♭ major.

The two altered modes share their parent's offset — harmonic minor minor's,
phrygian dominant phrygian's — because the step they raise is a non-diatonic
accidental, not a change of signature. Those fall to `makeKeySpeller`'s
non-diatonic default, which leans with the key and gets them right: A harmonic
minor's leading tone comes out `G♯`, C harmonic minor's `B`. That is what a
score would print.

**The circle arithmetic is Sonata's own** (`tonicFifths` / `fifthsToTonic` on
`sonata/score/core`), not a copy here: the speller that reads the answer is
built from the same two functions, so the two cannot drift.

`songVocabulary(key)` is the only way in. It builds ONE speller and closes over
it, so a round's answer boxes, chord buttons and lit keys all name chords and
notes against the same key — and Sonata's `KeySpeller` never reaches the barrel.

**The name and the numeral are one reading.** Both make the same
`matchChordTemplate(stack)` call (in `stack.ts`, beside `chordStack`), and both
fall back to the same `spelledTones`. A matched quality goes through Sonata's
`formatSpelledChordSymbol`, which spells root and bass through the key and
appends the slash only for a real inversion; an unmatched stack is the root's
note name plus the parenthesised tone list the numeral wears. So `V⁶₅` in G
reads `D7/F♯` — the figure and the slash saying the same thing two ways.

Naming is per KEY, not per chord's own spelling: ♭VI in C reads `A♭`, not `G♯`.

## Keys

`chordDigit` is the **letter** degree — the accidental never changes the key, so
♭VII is on the 7 and ♯IV on the 4, and every chord has one. (`chordDegree` has
nothing to say about a root outside the major scale, which is why the keys do
not read it.) `chordKeyPlan` groups the unlocked chords by digit, so a digit
several chords share can light them numbered and take a second key to pick one.

`pickPage` is that second stroke. With seven chords or fewer on a digit there is
a number for each and no paging (`pager` is null, and the page is ignored). Past
seven there are no numbers left, so the seventh key stops picking and starts
paging: keys 1–6 pick the six in reach, key 7 brings the next six into reach,
wrapping at the end. The page number wraps too, so a caller can hold one number
and increment it forever. No chord is ever out of reach of the keyboard,
however long a digit's list grows — a promise kept by construction rather than
by the curriculum staying small.

## Drawing

`web/` is the one place a chord is drawn: `<ChordNumeral>` and
`chordToneStyle`, with `.chord-tone` / `.chord-num` in `chord-paint.css`. The
trainer and the curriculum both use them, so one chord reads the same in an
answer box, on a button, in a panel chip and in the locked next step. Sizes
belong to the surface, not here.

## Voicing, and what the app actually sounds

`chordVoicing` is Sonata's `chordPitches` + `invertVoicing`, then shifted by
octaves so the bass is the pitch nearest middle C (F♯3–F4): every chord in the
same register.

`chordSound` is that plus the **doubled bass** — the voicing's lowest note an
octave below — and `pitches` is the two together, ascending. That list is both
what the piano is handed and what the keyboard lights, from this one call, so
the sound and the picture cannot disagree about which notes a chord is. Anything
that plays a chord or draws one reads `chordSound`; `chordVoicing` remains for
the chord's own notes, without the doubling.

**The inversion is the data's**, not a convention added here. Hookpad records
one per chord, the token spells it, `chordStack` finds which tone it puts
lowest, and the voicing puts that tone in the bass — so the doubled bass is the
3rd under a first-inversion chord, not always the root. The register, the
spacing and the doubling ARE this plugin's choice: Hookpad is a lead sheet and
carries no voicing at all. They are stated once, here, rather than guessed per
surface.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: How a chord is drawn, wherever it is drawn: <ChordNumeral> (the Roman numeral in the display serif, its quality mark and inversion figure raised beside it) and chordToneStyle (the degree's colour and tile depth, as the --fn custom properties the .chord-tone paint reads). Shared by the trainer's boxes, buttons and chips and by the curriculum's locked next step, so one chord reads the same everywhere.
- Web:
  - Uses: `primitives/css/ui-kit.cn`
  - Exports (values):
    - `ChordNumeral`
    - `chordToneStyle`
- Core:
  - Uses:
    - `apps/chord/song-index.ChordToken`
    - `apps/chord/song-index.parseChordToken`
    - `apps/sonata/score.accidentalGlyph`
    - `apps/sonata/score.fifthsToTonic`
    - `apps/sonata/score.KeySignature`
    - `apps/sonata/score.makeKeySpeller`
    - `apps/sonata/score.tonicFifths`
    - `apps/sonata/theory.CHORD_TEMPLATES`
    - `apps/sonata/theory.chordPitches`
    - `apps/sonata/theory.ChordTemplate`
    - `apps/sonata/theory.formatSpelledChordSymbol`
    - `apps/sonata/theory.invertVoicing`
    - `apps/sonata/theory.romanNumeral`
    - `integrations/hooktheory.HookpadMode`
    - `integrations/hooktheory.hookpadTonicPc`
  - Exports (types):
    - `ChordDigit`
    - `ChordFunction`
    - `ChordKeyGroup`
    - `ChordLabel`
    - `ChordPick`
    - `ChordSound`
    - `SongKey`
    - `SongVocabulary`
  - Exports (values):
    - `chordDegree`
    - `chordDigit`
    - `chordFunction`
    - `chordKeyPlan`
    - `chordLabel`
    - `chordSound`
    - `chordVoicing`
    - `pickPage`
    - `songKeyLabel`
    - `songKeySignature`
    - `songKeyTonicPc`
    - `songVocabulary`
- Cross-plugin:
  - Imported by:
    - `apps/chord/curriculum`
    - `apps/chord/piano`
    - `apps/chord/trainer`

<!-- AUTOGENERATED:END -->
