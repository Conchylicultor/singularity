import { z } from "zod";
import type { AvatarColor } from "@plugins/primitives/plugins/avatar/core";

/**
 * What KIND of place a snapshot names — the neutral vocabulary the card's icon
 * is drawn from. A closed set on purpose: every provider maps its own taxonomy
 * (Google's several hundred `primaryType`s, an OSM tag, …) ONTO these, so no
 * one provider's type names ever reach stored block data. Adding a kind is one
 * row here plus its glyph (the web glyph table is `satisfies Record<PlaceKind,
 * …>`, so a missing glyph is a tsc error).
 *
 * Each kind belongs to one family, and the family — not the kind — picks the
 * colour, so a café, a bakery and a restaurant read as one group at a glance.
 */
export const PLACE_KINDS = {
  clothing: { family: "shopping" },
  shop: { family: "shopping" },
  grocery: { family: "shopping" },
  cafe: { family: "food" },
  bakery: { family: "food" },
  restaurant: { family: "food" },
  bar: { family: "food" },
  hotel: { family: "lodging" },
  park: { family: "nature" },
  museum: { family: "culture" },
  attraction: { family: "culture" },
  worship: { family: "culture" },
  transit: { family: "transport" },
  parking: { family: "transport" },
  health: { family: "services" },
  fitness: { family: "services" },
  school: { family: "services" },
  /** A plain street address, road or locality — somewhere, not a venue. */
  address: { family: "none" },
} as const satisfies Record<string, { family: PlaceFamily }>;

export type PlaceKind = keyof typeof PLACE_KINDS;

export type PlaceFamily =
  | "shopping"
  | "food"
  | "lodging"
  | "nature"
  | "culture"
  | "transport"
  | "services"
  | "none";

/** Family → the categorical palette slot its circle is painted with. */
export const PLACE_FAMILY_COLOR = {
  shopping: "violet",
  food: "orange",
  lodging: "sky",
  nature: "emerald",
  culture: "rose",
  transport: "indigo",
  services: "teal",
  none: "slate",
} as const satisfies Record<PlaceFamily, AvatarColor>;

export const PlaceKindSchema = z.enum(
  Object.keys(PLACE_KINDS) as [PlaceKind, ...PlaceKind[]],
);

/** Pure: the palette slot a place of this kind is painted with (`none` when unknown). */
export function placeKindColor(kind: PlaceKind | undefined): AvatarColor {
  return PLACE_FAMILY_COLOR[
    kind === undefined ? "none" : PLACE_KINDS[kind].family
  ];
}
