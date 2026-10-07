import {
  placeTokenFill,
  type PlacePaletteToken,
} from "@plugins/ui/plugins/tokens/plugins/place-palette/core";
import type { PlaceFamily } from "../../core";

/**
 * The colour a place of this family is painted with — on the card and on the
 * map: its token in the `place` palette group. The template type makes a family
 * without a token a tsc error.
 */
export function placeFamilyFill(family: PlaceFamily | undefined): string {
  const token: PlacePaletteToken = `place-${family ?? "none"}`;
  return placeTokenFill(token);
}
