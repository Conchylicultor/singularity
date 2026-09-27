import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setKeyAutoDetectEndpoint } from "../shared/endpoints";
import { handleSetKeyAutoDetect } from "./internal/routes";
import { keyAutoDetectsServed } from "./internal/resource";

export { songKeyAutoDetect } from "./internal/tables";

export default {
  description:
    "Owns the sonata_songs_ext_key_auto_detect side-table: per-song toggle to ignore the authored (MIDI) key and auto-detect from notes. Serves it as a per-song lookup collection.",
  httpRoutes: {
    [setKeyAutoDetectEndpoint.route]: handleSetKeyAutoDetect,
  },
  contributions: [...keyAutoDetectsServed.declare],
} satisfies ServerPluginDefinition;
