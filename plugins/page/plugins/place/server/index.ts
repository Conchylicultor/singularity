import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Editor } from "@plugins/page/plugins/editor/server";
import { placeBlock, placeResolveEndpoint, placeSearchEndpoint } from "../core";
import { handlePlaceResolve, handlePlaceSearch } from "./internal/handlers";

export { definePlaceProvider, getPlaceProvider } from "./internal/registry";
export type { PlaceProvider } from "./internal/registry";

export default {
  description:
    "Place block server half: the definePlaceProvider registry plus the two provider-agnostic lookup endpoints (search, resolve), which dispatch by `providerId` and name no provider. Also registers the place `data` schema at the server write boundary.",
  httpRoutes: {
    [placeSearchEndpoint.route]: handlePlaceSearch,
    [placeResolveEndpoint.route]: handlePlaceResolve,
  },
  contributions: [Editor.BlockData(placeBlock)],
} satisfies ServerPluginDefinition;
