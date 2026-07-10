import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setRhythmEndpoint } from "../shared/endpoints";
import { handleSetRhythm } from "./internal/routes";
import { rhythmLiveResource } from "./internal/resource";

export { songRhythm } from "./internal/tables";
export { rhythmLiveResource } from "./internal/resource";

export default {
  description:
    "Owns the sonata_songs_ext_rhythm side-table: per-song rhythm groove (enabled + a bass and a chord RhythmPattern). Serves the reactive rollup.",
  httpRoutes: {
    [setRhythmEndpoint.route]: handleSetRhythm,
  },
  contributions: [Resource.Declare(rhythmLiveResource)],
} satisfies ServerPluginDefinition;
