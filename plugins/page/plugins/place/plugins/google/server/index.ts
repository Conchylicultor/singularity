import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { googlePlaceProvider } from "./internal/provider";

export default {
  description:
    "Google Places provider for the /place block: adapts the Places API client (autocomplete + details) onto the place-provider registry, reading the API key through the Google Maps integration.",
  register: [googlePlaceProvider],
} satisfies ServerPluginDefinition;
