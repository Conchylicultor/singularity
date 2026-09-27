import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setRhythmEndpoint } from "../shared/endpoints";
import { handleSetRhythm } from "./internal/routes";
import { rhythmsServed } from "./internal/resource";

export { songRhythm } from "./internal/tables";

export default {
  description:
    "Owns the sonata_songs_ext_rhythm side-table: per-song rhythm groove (enabled + a bass and a chord RhythmPattern). Serves it as a per-song lookup collection.",
  httpRoutes: {
    [setRhythmEndpoint.route]: handleSetRhythm,
  },
  contributions: [...rhythmsServed.declare],
} satisfies ServerPluginDefinition;
