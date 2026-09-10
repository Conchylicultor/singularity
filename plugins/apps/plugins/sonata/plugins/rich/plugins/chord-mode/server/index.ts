import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setChordModeEndpoint } from "../shared/endpoints";
import { handleSetChordMode } from "./internal/routes";
import { chordModeLiveResource } from "./internal/resource";

export { songChordMode } from "./internal/tables";
export { chordModeLiveResource } from "./internal/resource";

export default {
  description:
    "Owns the sonata_songs_ext_chord_mode side-table: per-song toggle to play a song's detected chords (voiced onto the Chords / Bass tracks) instead of its notes. Serves the reactive rollup.",
  httpRoutes: {
    [setChordModeEndpoint.route]: handleSetChordMode,
  },
  contributions: [Resource.Declare(chordModeLiveResource)],
} satisfies ServerPluginDefinition;
