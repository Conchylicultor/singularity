import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { placeBlock } from "../core";
import { Place } from "./slots";
import { PlaceBlock } from "./components/place-block";

export { Place } from "./slots";
export type { PlaceProviderContribution } from "./slots";
export { usePlaceProviders } from "./internal/use-place-providers";
export { placeBlock, PLACE_TYPE } from "../core";

export default {
  description:
    "Place block type: search an address or business through a registered place provider and render it as a card (name, address, category, link out to the provider's map). Owns the Place.Provider registry, so the block names no provider.",
  contributions: [
    Editor.Block({
      id: placeBlock.type,
      match: placeBlock.type,
      block: placeBlock,
      component: PlaceBlock,
    }),
  ],
  slots: Place,
} satisfies PluginDefinition;
