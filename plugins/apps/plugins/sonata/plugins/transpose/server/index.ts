import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setTransposeEndpoint } from "../shared/endpoints";
import { handleSetTranspose } from "./internal/routes";
import { transposesServed } from "./internal/resource";

export { songTranspose } from "./internal/tables";

export default {
  description:
    "Owns the sonata_songs_ext_transpose side-table: per-song global transpose offset (semitones). Serves it as a per-song lookup collection.",
  httpRoutes: {
    [setTransposeEndpoint.route]: handleSetTranspose,
  },
  contributions: [...transposesServed.declare],
} satisfies ServerPluginDefinition;
