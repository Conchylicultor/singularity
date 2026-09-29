import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { GeoMap } from "@plugins/map/web";
import { PageMap } from "@plugins/page/plugins/map/web";
import { PlacePin } from "./components/place-pin";
import {
  PLACE_PIN_TYPE,
  describeUnplacedPlaces,
  placeOverlays,
} from "./internal/place-layer";

export default {
  description:
    "Puts /place blocks on the /map block: a PageMap.Layer turning every located place on the page into a pin that points back at its block (picked places without coordinates are counted as unplaced, not dropped), and the place pin itself — a bubble with the location icon and the truncated name that grows and takes the primary tone when active.",
  contributions: [
    PageMap.Layer({
      id: "place",
      overlays: placeOverlays,
      describeUnplaced: describeUnplacedPlaces,
      emptyHint: "Add a /place block to see it on the map.",
    }),
    GeoMap.Pin({ match: PLACE_PIN_TYPE, component: PlacePin }),
  ],
} satisfies PluginDefinition;
