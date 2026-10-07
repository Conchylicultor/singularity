import { z } from "zod";

/**
 * What KIND of place a snapshot names — the neutral vocabulary the card's GLYPH
 * is drawn from. A closed set on purpose: every provider maps its own taxonomy
 * (Google's several hundred `primaryType`s, an OSM tag, …) ONTO these, so no
 * one provider's type names ever reach stored block data. Adding a kind is one
 * entry here plus its glyph (the web glyph table is `satisfies Record<PlaceKind,
 * …>`, so a missing glyph is a tsc error). The colour is not the kind's: it is
 * the place's `family`.
 */
export const PLACE_KINDS = [
  "clothing",
  "shop",
  "grocery",
  "cafe",
  "bakery",
  "restaurant",
  "bar",
  "hotel",
  "park",
  "museum",
  "attraction",
  "worship",
  "transit",
  "parking",
  "health",
  "fitness",
  "school",
  /** A plain street address, road or locality — somewhere, not a venue. */
  "address",
] as const;

export type PlaceKind = (typeof PLACE_KINDS)[number];

/**
 * Which broad CATEGORY a place belongs to — the card's colour. One family per
 * heading of Google's place-type Table A
 * (https://developers.google.com/maps/documentation/places/web-service/place-types),
 * spelled neutrally: the taxonomy is Google's, the names are ours, so a
 * provider maps onto them and its own heading strings never reach block data.
 */
export const PLACE_FAMILIES = [
  "automotive",
  "business",
  "culture",
  "education",
  "entertainment",
  "facilities",
  "finance",
  "food",
  "geographic",
  "government",
  "health",
  "housing",
  "lodging",
  "nature",
  "worship",
  "services",
  "shopping",
  "sports",
  "transport",
] as const;

export type PlaceFamily = (typeof PLACE_FAMILIES)[number];

export const PlaceKindSchema = z.enum(PLACE_KINDS);

export const PlaceFamilySchema = z.enum(PLACE_FAMILIES);
