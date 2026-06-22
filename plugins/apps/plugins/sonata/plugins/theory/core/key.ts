/**
 * Forward key parsing: a key-signature string → `KeySignature`.
 *
 * Ultimate Guitar (and other authoring sources) carry the song key as a free
 * string like `"C"`, `"Am"`, `"F#m"`, `"Bbmaj"`, `"G minor"`. This turns that
 * into the canonical `{ tonic, mode }`, or `null` when the field is absent or
 * unrecognised (so callers can simply omit `meta.key` rather than crash).
 *
 * The tonic is normalized minimally: `♯`/`♭` glyphs become `#`/`b`, the letter
 * is uppercased (validated A–G), and the accidental is preserved verbatim
 * (`"bb"` → `"Bb"`, `"f#"` → `"F#"`). The mode comes from a trailing
 * `m`/`min`/`minor` (minor) vs `M`/`maj`/`major`/nothing (major).
 */

import type { KeySignature } from "@plugins/apps/plugins/sonata/plugins/score/core";

/** Valid natural note letters. */
const LETTERS = new Set(["A", "B", "C", "D", "E", "F", "G"]);

/**
 * Parse a key-signature string into `KeySignature`, or `null` if absent /
 * unrecognised. Handles plain letters (`"C"`), minor shorthand (`"Am"`), the
 * `min`/`minor`/`maj`/`major` word forms, and `#`/`b`/`♯`/`♭` accidentals.
 */
export function parseKeySignature(
  input: string | null | undefined,
): KeySignature | null {
  if (input == null) return null;

  const s = input.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  if (s.length === 0) return null;

  // Root: a letter A–G followed by any number of accidentals (# / b), then the
  // remaining text decides the mode.
  const m = /^([A-Ga-g])([#b]*)(.*)$/.exec(s);
  if (!m) return null;

  const letter = m[1]!.toUpperCase();
  if (!LETTERS.has(letter)) return null;

  const accidentals = m[2]!;
  const rest = m[3]!.trim();

  let mode: "major" | "minor";
  if (rest === "" || rest === "M" || rest === "maj" || rest === "major") {
    mode = "major";
  } else if (rest === "m" || rest === "min" || rest === "minor") {
    mode = "minor";
  } else {
    return null;
  }

  return { tonic: letter + accidentals, mode };
}
