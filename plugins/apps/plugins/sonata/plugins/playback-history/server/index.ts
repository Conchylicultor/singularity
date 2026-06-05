import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { recordPlay } from "../shared/endpoints";
import { handleRecordPlay } from "./internal/routes";
import { playbackHistoryLiveResource } from "./internal/resource";

export { songPlayback } from "./internal/tables";
export { playbackHistoryLiveResource } from "./internal/resource";

export default {
  name: "Sonata: Playback History",
  description:
    "Owns the sonata_songs_ext_playback side-table: per-song play count + last-played. Records a play on playback start and serves the reactive rollup.",
  httpRoutes: {
    [recordPlay.route]: handleRecordPlay,
  },
  contributions: [Resource.Declare(playbackHistoryLiveResource)],
} satisfies ServerPluginDefinition;
