import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setTransposeEndpoint } from "../shared/endpoints";
import { handleSetTranspose } from "./internal/routes";
import { transposeLiveResource } from "./internal/resource";

export { songTranspose } from "./internal/tables";
export { transposeLiveResource } from "./internal/resource";

export default {
  description:
    "Owns the sonata_songs_ext_transpose side-table: per-song global transpose offset (semitones). Serves the reactive rollup.",
  httpRoutes: {
    [setTransposeEndpoint.route]: handleSetTranspose,
  },
  contributions: [Resource.Declare(transposeLiveResource)],
} satisfies ServerPluginDefinition;
