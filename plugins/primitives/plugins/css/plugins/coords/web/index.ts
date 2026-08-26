import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Placed,
  placedClasses,
  placedStyle,
  pct,
  type Coord,
  type Extent,
  type PlacedProps,
  type PlacedOptions,
} from "./internal/coords";

export default {
  description:
    "Coordinate-space positioning primitive: <Placed x y> / placedStyle() places a box by runtime numbers on both axes, plus pct() for fractional coordinates.",
  contributions: [],
} satisfies PluginDefinition;
