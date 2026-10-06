import type React from "react";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { MapTileScheme } from "../../core";

/** How far the outline reaches past each glyph, in px. */
const HALO_PX = 3;

/**
 * Ink and outline per tile scheme. Fixed black/white on purpose, like an image
 * scrim: the label sits on the TILES, which are not themed, so it follows the
 * renderer's tile scheme and never the app theme.
 */
const PAINT = {
  light: { ink: "text-black/85", halo: "white" },
  dark: { ink: "text-white", halo: "black" },
} as const satisfies Record<MapTileScheme, { ink: string; halo: string }>;

/** Bold text outlined in the tile colour, the way a map labels its own places. */
function haloShadow(color: string): string {
  const soft = `0 0 2px ${color}, 0 0 2px ${color}, 0 0 ${HALO_PX}px ${color}`;
  const crisp = [
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ]
    .map(([x, y]) => `${x}px ${y}px 0 ${color}`)
    .join(", ");
  return `${soft}, ${crisp}`;
}

export interface MapLabelProps {
  /** The scheme of the tiles under the label — a pin's `tiles` prop. */
  tiles: MapTileScheme;
  children: React.ReactNode;
}

/**
 * A place name drawn on the map: one truncating line in map-label paint.
 *
 * The truncating `<Text>` clips (`overflow: hidden`), which would cut the
 * outline off flat at the box's edge. So the box is padded by exactly the
 * outline's reach — the outline is painted INSIDE the clip — and the line is
 * pulled back by the same amount, so the text lands where an unpadded label would. Both come
 * from `HALO_PX`, so the room and the outline cannot drift apart.
 */
export function MapLabel({ tiles, children }: MapLabelProps) {
  const paint = PAINT[tiles];
  return (
    // The pull-back sits on the Line, not on the Text: a negative margin on the
    // clipping box itself would shrink the width its parent reserves for it
    // below the box's own padded width, truncating every name by 2 × HALO_PX.
    <Line style={{ margin: -HALO_PX }}>
      <Text
        variant="label"
        className={paint.ink}
        style={{ textShadow: haloShadow(paint.halo), padding: HALO_PX }}
      >
        {children}
      </Text>
    </Line>
  );
}
