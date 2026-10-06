import { z } from "zod";

/**
 * One Ultimate Guitar search hit — the slim subset of a UG `/tab/search`
 * result entry the import dialog needs to render a candidate row. The client
 * synthesizes `https://tabs.ultimate-guitar.com/tab/<tabId>` for import, so we
 * carry only the numeric `tabId` (as a string) plus display metadata.
 */
export const UgSearchResultSchema = z.object({
  /** Numeric UG tab id, as a string. */
  tabId: z.string(),
  songName: z.string(),
  artistName: z.string(),
  /** Raw UG type string, e.g. "Chords", "Ukulele Chords", "Tab", "Official". */
  type: z.string(),
  /** Community rating, 0–5. */
  rating: z.number(),
  votes: z.number(),
  /** Tab version, or `null` when UG has none. */
  version: z.number().nullable(),
});

export type UgSearchResult = z.infer<typeof UgSearchResultSchema>;
