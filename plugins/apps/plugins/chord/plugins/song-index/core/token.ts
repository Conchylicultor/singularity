import { z } from "zod";
import type { HookpadChordSound } from "@plugins/integrations/plugins/hooktheory/core";

// ── Chord identity: what a chord sounds like, relative to the local tonic ────
//
// Transcribers spell one sound several ways (D major in C is a V/V or a
// borrowed lydian II). A listener hears no difference, so the index keys every
// chord by its sound: `<root semitones above tonic>:<stacked intervals>/<inversion>`.
//
//   "0:4-3/0"    I (major triad)
//   "7:4-3-3/1"  V7, first inversion
//   "10:4-3/0"   ♭VII
//
// Exact on purpose: a V7 is not a V, an add9 is not a triad. The spelling is
// not lost — every stored chord keeps its Hookpad fields, and `features` says
// how it was written. A rest has no token.

/** A chord's sound relative to the tonic, in its one canonical spelling. Opaque in SQL. */
export type ChordToken = string & { readonly __brand: "ChordToken" };

/** The three parts a token spells. */
export type ChordTokenParts = {
  /** Semitones from the tonic up to the root, 0–11. */
  root: number;
  /** Root-position semitones between consecutive tones, lowest first. May be empty (a lone root). */
  intervals: readonly number[];
  /** Hookpad's inversion: 0 = root position, 1 = 3rd in the bass, … */
  inversion: number;
};

/** Canonical form only: no leading zeros, root 0–11, intervals ≥ 1. */
const TOKEN_PATTERN =
  /^(1[01]|[0-9]):((?:[1-9][0-9]*)(?:-[1-9][0-9]*)*)?\/(0|[1-9][0-9]*)$/;

function assertParts({ root, intervals, inversion }: ChordTokenParts): void {
  const ok =
    Number.isInteger(root) &&
    root >= 0 &&
    root <= 11 &&
    intervals.every((i) => Number.isInteger(i) && i >= 1) &&
    Number.isInteger(inversion) &&
    inversion >= 0;
  if (!ok) {
    throw new Error(
      `Not a chord token's parts: root ${root}, intervals [${intervals.join(", ")}], inversion ${inversion}`,
    );
  }
}

/** Spell parts as a token. Throws on parts no token can spell (a root outside 0–11, a non-positive interval). */
export function chordTokenFromParts(parts: ChordTokenParts): ChordToken {
  assertParts(parts);
  return `${parts.root}:${parts.intervals.join("-")}/${parts.inversion}` as ChordToken;
}

/** The token of a chord's sound (`hookpadChordSound`) in a key whose tonic is `tonicPc` (0–11). */
export function chordToken(
  sound: HookpadChordSound,
  tonicPc: number,
): ChordToken {
  return chordTokenFromParts({
    root: (((sound.rootPc - tonicPc) % 12) + 12) % 12,
    intervals: sound.intervals,
    inversion: sound.inversion,
  });
}

/**
 * Read a token back into its parts. Throws on a string that is not a token in
 * canonical form: a `ChordToken` is valid by construction, and untrusted input
 * goes through `ChordTokenSchema` instead, which reports rather than throws.
 */
export function parseChordToken(text: string): ChordTokenParts {
  const match = TOKEN_PATTERN.exec(text);
  if (match === null) {
    throw new Error(
      `"${text}" is not a chord token (expected <root 0–11>:<intervals joined by ->/<inversion>, e.g. "7:4-3-3/1")`,
    );
  }
  const [, root = "", intervals, inversion = ""] = match;
  return {
    root: Number(root),
    intervals: intervals === undefined ? [] : intervals.split("-").map(Number),
    inversion: Number(inversion),
  };
}

/** A chord token on the wire: a string in canonical form, branded. */
export const ChordTokenSchema = z
  .string()
  .regex(
    TOKEN_PATTERN,
    'A chord token is <root 0–11>:<intervals joined by ->/<inversion>, e.g. "7:4-3-3/1"',
  )
  .transform((text) => text as ChordToken);
