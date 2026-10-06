import { z } from "zod";

/**
 * The normalized raw tab returned by the UG fetch client. A flat, source-of-
 * truth shape — NO parsing of the `[ch]…[/ch]` / `[tab]…[/tab]` chord+lyric
 * markup happens here (that is a later task); `content` is carried verbatim.
 */
export const UgTabSchema = z.object({
  /** Numeric UG tab id, as a string. */
  tabId: z.string(),
  songName: z.string(),
  artistName: z.string(),
  /** UG tab type, e.g. "Chords", "Tab". */
  type: z.string(),
  /** Tonality/key, or `null` when UG has none set. */
  key: z.string().nullable(),
  /** Capo fret, 0 when none. */
  capo: z.number(),
  /** Tuning string, e.g. "E A D G B E". */
  tuning: z.string(),
  /** The load-bearing chord+lyric markup, verbatim from UG. */
  content: z.string(),
  /** Canonical web URL of the tab on ultimate-guitar.com. */
  urlWeb: z.string(),
});

export type UgTab = z.infer<typeof UgTabSchema>;
