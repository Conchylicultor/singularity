import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setKeyAutoDetectEndpoint } from "../shared/endpoints";
import { handleSetKeyAutoDetect } from "./internal/routes";
import { keyAutoDetectLiveResource } from "./internal/resource";

export { songKeyAutoDetect } from "./internal/tables";
export { keyAutoDetectLiveResource } from "./internal/resource";

export default {
  description:
    "Owns the sonata_songs_ext_key_auto_detect side-table: per-song toggle to ignore the authored (MIDI) key and auto-detect from notes. Serves the reactive rollup.",
  httpRoutes: {
    [setKeyAutoDetectEndpoint.route]: handleSetKeyAutoDetect,
  },
  contributions: [Resource.Declare(keyAutoDetectLiveResource)],
} satisfies ServerPluginDefinition;
