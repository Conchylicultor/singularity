import { z } from "zod";

/**
 * One candidate a provider offers while the user is typing — the two lines a
 * result row shows. Deliberately NOT a snapshot: a suggestion carries only what
 * is needed to recognise a place and to ask for it by id, so a provider that
 * charges per resolved place is never made to resolve ten of them to fill a
 * dropdown.
 *
 * `secondary` is optional because a place may genuinely have nothing below its
 * name (a whole city). `primary` and `placeId` are not: a row with no label is
 * not a row, and a row you cannot pick is not a suggestion.
 */
export const PlaceSuggestionSchema = z.object({
  /** Provider-scoped identity. Opaque to this plugin — never parsed, only echoed back. */
  placeId: z.string(),
  /** The headline line (the place's name, or the street line for a plain address). */
  primary: z.string(),
  /** The supporting line (city / region / country), when the provider has one. */
  secondary: z.string().optional(),
});

export type PlaceSuggestion = z.infer<typeof PlaceSuggestionSchema>;

/**
 * A resolved place, in the neutral vocabulary every provider maps ONTO. This is
 * the shape the block stores, so it is also the shape a page's markdown carries
 * — which is why it holds display fields and not a provider's raw payload.
 *
 * `name` and `address` are required: a resolved place that can say neither what
 * it is called nor where it is has not been resolved. Everything else is
 * genuinely provider- or place-dependent (a park has no category, a geocoder
 * has no map page of its own), and an absent field renders as an absent line.
 */
export const PlaceSnapshotSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string(),
  /** Human-readable kind ("Coffee shop", "Museum"), when the provider names one. */
  category: z.string().optional(),
  /** The provider's own page for this place, opened by the card's external link. */
  mapsUrl: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type PlaceSnapshot = z.infer<typeof PlaceSnapshotSchema>;

/**
 * The block's stored `data`. Every field is optional because the block is
 * created EMPTY (`/place` with nothing chosen yet) and fills in over two steps:
 * picking a suggestion writes `{ providerId, placeId }`, and the resolve that
 * follows writes the snapshot plus its `fetchedAt` stamp.
 *
 * Declared here rather than inline in `place-block.ts` so the pure snapshot
 * helpers in `staleness.ts` can be typed against it without importing the block
 * handle (which would be a cycle: the handle is built FROM this schema).
 */
export const PlaceDataSchema = z.object({
  /** Which registered provider owns `placeId`. Absent until a place is picked. */
  providerId: z.string().optional(),
  placeId: z.string().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  mapsUrl: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  /** ms epoch of the last successful resolve — drives the refresh window. */
  fetchedAt: z.number().optional(),
});

export type PlaceData = z.infer<typeof PlaceDataSchema>;
