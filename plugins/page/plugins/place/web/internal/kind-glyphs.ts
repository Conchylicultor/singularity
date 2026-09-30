import { symbol, type SymbolRef } from "@plugins/ui/plugins/icons/core";
import type { PlaceKind } from "../../core";

/**
 * Kind → the glyph drawn in the card's circle. Every entry is a literal
 * `symbol("…")` call so the sprite manifest scan ships it, and the `satisfies`
 * makes a kind added to `PLACE_KINDS` without a glyph a tsc error.
 */
const PLACE_KIND_GLYPH = {
  clothing: symbol("apparel"),
  shop: symbol("storefront"),
  grocery: symbol("shopping-bag"),
  cafe: symbol("local-cafe"),
  bakery: symbol("bakery-dining"),
  restaurant: symbol("restaurant"),
  bar: symbol("local-bar"),
  hotel: symbol("hotel"),
  park: symbol("park"),
  museum: symbol("museum"),
  attraction: symbol("attractions"),
  worship: symbol("church"),
  transit: symbol("train"),
  parking: symbol("local-parking"),
  health: symbol("local-hospital"),
  fitness: symbol("fitness-center"),
  school: symbol("school"),
  address: symbol("location-on"),
} satisfies Record<PlaceKind, SymbolRef>;

/** A place whose kind is unknown (not mapped, or stored before kinds existed). */
const UNKNOWN_GLYPH = symbol("location-on");

export function placeKindGlyph(kind: PlaceKind | undefined): SymbolRef {
  return kind === undefined ? UNKNOWN_GLYPH : PLACE_KIND_GLYPH[kind];
}
