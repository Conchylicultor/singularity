import {
  chordTokenFromParts,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";

// Placeholder until the curriculum decides which chords unlock, and in which
// order: the curriculum task replaces both lists. Tokens are exact, so a IV in
// first inversion is a different chord and loops holding one stay out.

/** I, IV and V, root-position major triads. */
export const STARTING_CHORDS: readonly ChordToken[] = [
  chordTokenFromParts({ root: 0, intervals: [4, 3], inversion: 0 }),
  chordTokenFromParts({ root: 5, intervals: [4, 3], inversion: 0 }),
  chordTokenFromParts({ root: 7, intervals: [4, 3], inversion: 0 }),
];

/** Loops are drawn from songs in these modes only. */
export const STARTING_MODES: readonly HookpadMode[] = ["major"];
