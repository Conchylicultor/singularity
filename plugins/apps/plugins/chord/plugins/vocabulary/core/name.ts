import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  accidentalGlyph,
  makeKeySpeller,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { formatSpelledChordSymbol } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { hookpadTonicPc } from "@plugins/integrations/plugins/hooktheory/core";
import { songKeySignature, type SongKey } from "./key";
import { chordStack, matchChordTemplate, pc12, spelledTones } from "./stack";

// ── A chord's absolute name in the song's key ────────────────────────────────
//
// The numeral says what a chord DOES ("V7"); the name says what it IS in this
// song ("D7"). A token is relative to the tonic, so naming it takes the key:
// the key's tonic turns the token's root into a real pitch class, and the key's
// signature decides how that pitch class is spelled (A♭ in E♭, G♯ in E).
//
// Both readings come from one `matchChordTemplate` call — the same call the
// numeral makes — so the letter name and the numeral can never describe
// different chords. A matched quality goes through Sonata's own chord-symbol
// formatter, which spells root and bass through the key and appends the slash
// only for a real inversion; an unmatched stack wears the same parenthesised
// tone list the numeral wears.

/** Everything this song's key lets us say about a chord. */
export type SongVocabulary = {
  /** The chord's absolute name in this key: "G", "Em", "D7", "D/F♯". */
  nameChord(token: ChordToken): string;
  /** A MIDI pitch as this key spells it: "A♭" in E♭, never "G♯". No octave. */
  noteName(pitch: number): string;
};

/**
 * Everything this song's key lets us say about a chord, built once per key.
 *
 * The one way in: a round's answer boxes, chord buttons and lit keys all read
 * the same speller, so a caller cannot name a chord against one key and label
 * its notes against another. Sonata's `KeySpeller` stays inside.
 */
export function songVocabulary(key: SongKey): SongVocabulary {
  const speller = makeKeySpeller(songKeySignature(key));
  const tonicPc = hookpadTonicPc(key.tonic);

  const noteName = (pitch: number): string => {
    const { step, alter } = speller.spell(pitch);
    return step + accidentalGlyph(alter);
  };

  const nameChord = (token: ChordToken): string => {
    const stack = chordStack(token);
    const bassTone = stack.tones[stack.bassIndex];
    if (bassTone === undefined) {
      throw new Error("The bass index is past the stack");
    }
    const rootPc = pc12(tonicPc + stack.root);
    const bassPc = pc12(rootPc + bassTone);

    const template = matchChordTemplate(stack);
    if (template !== undefined) {
      // Sonata appends the slash bass only when it differs from the root,
      // which for a matched stack is exactly an inversion: no quality in its
      // table has a tone a whole octave above the root.
      return formatSpelledChordSymbol(
        { root: rootPc, quality: template.quality, bass: bassPc },
        speller,
      );
    }
    const base = `${noteName(rootPc)}(${spelledTones(stack)})`;
    return stack.bassIndex > 0 ? `${base}/${noteName(bassPc)}` : base;
  };

  return { nameChord, noteName };
}
