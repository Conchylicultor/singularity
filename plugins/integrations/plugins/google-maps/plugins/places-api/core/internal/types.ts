import { z } from "zod";

/**
 * One row of a place search's dropdown. The neutral, provider-independent shape
 * a place picker renders — deliberately NOT Google's `placePrediction` wire
 * shape, so a second provider (OpenStreetMap) can fill the same contract.
 *
 * Schemas rather than bare interfaces because these values cross an HTTP
 * boundary in the consuming plugin: the endpoint that serves them parses them
 * back on the client.
 */
export const PlaceSuggestionSchema = z.object({
  /** Provider-scoped stable id, passed back to `placeDetails` to resolve it. */
  placeId: z.string(),
  /** The bold first line — usually the business or street name. */
  primary: z.string(),
  /**
   * The muted second line (city, country). OPTIONAL: Google omits
   * `structuredFormat.secondaryText` for some predictions, and an empty string
   * would be a fabricated value dressed up as a real one.
   */
  secondary: z.string().optional(),
});

export type PlaceSuggestion = z.infer<typeof PlaceSuggestionSchema>;

/**
 * A resolved place, as stored in the block. `name` and `address` are required —
 * a snapshot that can name neither is not a place, and the client throws rather
 * than emitting a half-blank card.
 *
 * Everything else is optional because the field mask is a cost decision (see
 * `PLACE_DETAILS_FIELD_MASK`) and a narrower mask must stay expressible without
 * a schema change.
 */
export const PlaceSnapshotSchema = z.object({
  placeId: z.string(),
  /** Display name — the business name, or the street address for a plain address. */
  name: z.string(),
  /** Full formatted postal address. */
  address: z.string(),
  /** Human-readable primary type ("French restaurant", "Park"). */
  category: z.string().optional(),
  /** Canonical Google Maps link for the place — the card's "Open in Maps". */
  mapsUrl: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type PlaceSnapshot = z.infer<typeof PlaceSnapshotSchema>;
