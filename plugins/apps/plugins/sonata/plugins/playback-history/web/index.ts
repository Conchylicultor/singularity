import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Library } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { RecordPlayObserver } from "./components/record-play-observer";
import { PlayStats } from "./components/play-stats";
import { PlaybackFields } from "./components/playback-fields";

export { usePlaybackHistory, usePlaybackHistoryMap } from "./hooks";

export default {
  description:
    "Per-song play count + last-played: records a play on playback start (Sonata.Effect), shows stats on each library card (Library.CardMeta), and contributes Plays / Last-played fields (Library.Fields) so they appear in the DataView's sort, filter, and table columns.",
  contributions: [
    Sonata.Effect({ id: "record-play", component: RecordPlayObserver }),
    Library.CardMeta({ id: "play-stats", component: PlayStats }),
    Library.Fields({ id: "playback", component: PlaybackFields }),
  ],
} satisfies PluginDefinition;
