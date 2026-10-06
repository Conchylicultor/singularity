import type { PageMapLayerResult } from "@plugins/page/plugins/map/core";
import { z } from "zod";
import type { MapPin } from "@plugins/map/core";
import type { Block } from "@plugins/page/plugins/editor/core";
import {
  PLACE_TYPE,
  PlaceKindSchema,
  placeBlock,
  type PlaceKind,
} from "@plugins/page/plugins/place/core";

/** The `GeoMap.Pin` type every place pin carries — the key the place pin is dispatched on. */
export const PLACE_PIN_TYPE = "place";

/**
 * What a place pin carries beyond its label: the place's kind, which picks the
 * pin's colour and glyph exactly as it picks the /place card's circle.
 */
const PlacePinDataSchema = z.object({ kind: PlaceKindSchema.optional() });
type PlacePinData = z.infer<typeof PlacePinDataSchema>;

/** The kind a place pin was made with. Throws on a pin this layer did not make. */
export function placePinKind(pin: MapPin): PlaceKind | undefined {
  return PlacePinDataSchema.parse(pin.data).kind;
}

/**
 * Every place on the page as a pin. A place that has been PICKED but has no
 * coordinates (still resolving, or stored before `lat`/`lng` were kept) is
 * counted as unplaced rather than dropped. An empty `/place` block — a search
 * box with nothing chosen — is not a place yet and counts as nothing. A row
 * whose data does not parse is the place block's own error to show, not the
 * map's.
 */
export function placeOverlays(blocks: readonly Block[]): PageMapLayerResult {
  const overlays: PageMapLayerResult["overlays"] = [];
  let unplaced = 0;
  for (const b of blocks) {
    if (b.type !== PLACE_TYPE) continue;
    const parsed = placeBlock.safeParse(b.data);
    if (!parsed.success) continue;
    const { placeId, lat, lng, name, kind } = parsed.data;
    if (placeId === undefined) continue;
    if (lat === undefined || lng === undefined) {
      unplaced++;
      continue;
    }
    overlays.push({
      overlay: {
        kind: "pin",
        id: b.id,
        pinType: PLACE_PIN_TYPE,
        position: { lat, lng },
        label: name,
        data: { kind } satisfies PlacePinData,
      },
      blockId: b.id,
    });
  }
  return { overlays, unplaced };
}

export function describeUnplacedPlaces(count: number): string {
  return count === 1
    ? "1 place is not on the map yet: it has no location."
    : `${count} places are not on the map yet: they have no location.`;
}
