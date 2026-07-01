/**
 * Global song transpose — a pure `Score → Score` shift by N semitones.
 *
 * Transposition is a music-theory operation, not a mere pitch arithmetic: it
 * must re-spell chord symbols and rename the key, which needs the chord
 * vocabulary (`formatChordSymbol`/`formatSpelledChordSymbol`) and the
 * fewest-accidental key-naming table (`tonicName`) — all in `theory`. So it
 * lives here beside `inferKeys`, as a peer Score→Score transform the shell's
 * pipeline injects right after `mergeScores` (before re-voicing / inference /
 * spelling), so every downstream consumer — audio, piano-roll geometry,
 * overlays, the key readout — transposes for free.
 *
 * Pure TypeScript: no React, no framework. Imports only `score/core` and sibling
 * theory modules, so the DAG stays acyclic.
 */

import {
  accidentalGlyph,
  asKeySignature,
  effectiveKeyAt,
  makeKeySpeller,
  type Annotation,
  type ChordData,
  type KeySignature,
  type KeySpeller,
  type LyricData,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { PC_NAMES } from "./chords";
import { tonicName, tonicPc } from "./key-detect";

/** Reduce any integer to a pitch-class in [0, 12). */
const pc12 = (pc: number): number => ((pc % 12) + 12) % 12;

/**
 * Transpose a key signature by `semitones`: shift its tonic's pitch-class
 * (mod 12) and re-name it via `tonicName` — the same fewest-accidental table
 * `inferKeys` uses — so the result is always a sane enharmonic key (C → D at +2,
 * sensible flats elsewhere), never nonsense like "B#" major. The mode is
 * preserved.
 */
export function transposeKey(
  key: KeySignature,
  semitones: number,
): KeySignature {
  const pc = pc12(tonicPc(key.tonic) + semitones);
  return { tonic: tonicName(pc, key.mode), mode: key.mode };
}

/**
 * Transpose a single bare note token through a key-correct speller: parse it to
 * a pitch-class, shift it, and re-name via `speller` (so a flat key reads "B♭",
 * a sharp key "A#"). The speller's octave is irrelevant for a note *name* — we
 * use only its step + alteration glyph.
 */
/** Spell a pitch-class to a note name (step + accidental glyph). */
type SpellName = (pc: number) => string;

/** Matches a leading bare note token: a letter A–G plus any accidentals. */
const LEADING_NOTE = /^([A-Ga-g][#b♯♭]*)/;

function shiftNoteToken(
  token: string,
  semitones: number,
  spell: SpellName,
): string {
  return spell(pc12(tonicPc(token) + semitones));
}

/**
 * Re-root a chord-text symbol by `semitones`, preserving its suffix verbatim.
 * The leading root token and an optional trailing `/<bass>` are shifted through
 * `spell` (which names a pitch-class); everything in between (`maj7`, `add9`,
 * `sus4`, `(♯5)`, …) is kept as written — more faithful than parse→canonicalize
 * for arbitrary chord text, and it transposes extensions it need not recognise.
 * This is the shared core behind both the public `transposeChordText` (key-aware
 * spelling for lyric chords) and the chord-annotation re-rooting below (sharps
 * for `symbol`, key-aware for `spelledSymbol`).
 *
 * Returns the input unchanged when there is no leading note token (e.g. "N.C.",
 * "%") so non-chord markers survive.
 */
function reRootSymbol(
  symbol: string,
  semitones: number,
  spell: SpellName,
): string {
  const rootMatch = LEADING_NOTE.exec(symbol);
  if (!rootMatch) return symbol;

  const rootToken = rootMatch[1]!;
  const rest = symbol.slice(rootToken.length);
  const newRoot = shiftNoteToken(rootToken, semitones, spell);

  // Split off an optional trailing slash bass; the chord quality suffix sits
  // between the root and the slash and is preserved verbatim.
  const slash = rest.indexOf("/");
  if (slash === -1) return newRoot + rest;

  const suffix = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const bassMatch = LEADING_NOTE.exec(after);
  if (!bassMatch) return newRoot + rest; // unparseable bass — keep it verbatim.

  const bassToken = bassMatch[1]!;
  const bassRest = after.slice(bassToken.length);
  const newBass = shiftNoteToken(bassToken, semitones, spell);
  return newRoot + suffix + "/" + newBass + bassRest;
}

/**
 * Transpose an authored chord-text symbol (e.g. a songsheet/Ultimate-Guitar
 * chord) by `semitones`, key-correctly spelling the root and any `/<bass>`
 * through `speller` while preserving the quality suffix verbatim.
 */
export function transposeChordText(
  symbol: string,
  semitones: number,
  speller: KeySpeller,
): string {
  return reRootSymbol(symbol, semitones, (pc) => {
    const { step, alter } = speller.spell(pc);
    return step + accidentalGlyph(alter);
  });
}

/**
 * Shift an entire Score up/down by `semitones` semitones.
 *
 * Pure: returns a new Score, never mutates the input. A **no-op only when
 * `semitones === 0`** — a ±12 octave shift is NOT a no-op (it moves audio + roll
 * position even though pitch-classes are unchanged).
 *
 *  - Every note's `pitch` shifts by `semitones`; its `spelling` is cleared so the
 *    downstream `spellScore` re-derives the staff spelling against the transposed
 *    key. No clamping — extreme notes degrade gracefully (the roll clamps, audio
 *    stays silent); the ±12 toolbar range keeps essentially all notes in range.
 *  - `meta.key` and authored `type:"key"` annotations are renamed via
 *    `transposeKey`.
 *  - `type:"chord"` annotations shift `root`/`bass` (mod 12) and re-root their
 *    `symbol` (normalized sharps) and `spelledSymbol` (key-aware, spelled through
 *    the *transposed* key in force at the annotation — so flat keys read "B♭m"),
 *    preserving the quality suffix verbatim so alterations like "(♯5)" survive.
 *    `intervals` is root-relative and rides through unchanged.
 *  - `type:"lyric"` annotations transpose each printed `chords[].symbol` via
 *    `transposeChordText` — the only lens whose chord display is authored text.
 *  - Other annotation types (`section`, `voicing`) are untouched.
 */
export function transposeScore(score: Score, semitones: number): Score {
  if (semitones === 0) return score;

  const notes = score.notes.map((n) => ({
    ...n,
    pitch: n.pitch + semitones,
    spelling: undefined,
  }));

  const metaKey = score.meta.key
    ? transposeKey(score.meta.key, semitones)
    : undefined;

  // First transpose every key annotation, so the key context used to spell chord
  // roots below is already shifted (a chord at a +2-transposed C-major region
  // spells against D major).
  const keyTransposed: Annotation[] = score.annotations.map((a) => {
    if (a.type !== "key") return a;
    const key = asKeySignature(a);
    if (!key) return a;
    return { ...a, data: transposeKey(key, semitones) };
  });

  // A score whose key context (meta.key + key annotations) is already
  // transposed, so `effectiveKeyAt` yields the transposed key for chord/lyric
  // spelling.
  const keyedScore: Score = {
    ...score,
    meta: { ...score.meta, key: metaKey },
    annotations: keyTransposed,
  };

  const annotations: Annotation[] = keyTransposed.map((a) => {
    if (a.type === "chord") {
      const data = a.data as ChordData;
      const speller = makeKeySpeller(effectiveKeyAt(keyedScore, a.start));
      // Re-root by shifting only the root/bass and preserving the suffix (which
      // may carry alterations like "(♯5)" that `quality` alone can't reproduce).
      return {
        ...a,
        data: {
          ...data,
          root: pc12(data.root + semitones),
          bass:
            data.bass === undefined ? undefined : pc12(data.bass + semitones),
          symbol: reRootSymbol(data.symbol, semitones, (pc) => PC_NAMES[pc]!),
          spelledSymbol: transposeChordText(
            data.spelledSymbol ?? data.symbol,
            semitones,
            speller,
          ),
        } satisfies ChordData,
      };
    }
    if (a.type === "lyric") {
      const data = a.data as LyricData;
      const speller = makeKeySpeller(effectiveKeyAt(keyedScore, a.start));
      return {
        ...a,
        data: {
          ...data,
          chords: data.chords.map((c) => ({
            ...c,
            symbol: transposeChordText(c.symbol, semitones, speller),
          })),
        } satisfies LyricData,
      };
    }
    return a;
  });

  return {
    ...score,
    meta: { ...score.meta, key: metaKey },
    notes,
    annotations,
  };
}
