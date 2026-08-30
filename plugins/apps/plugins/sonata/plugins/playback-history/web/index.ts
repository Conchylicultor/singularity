import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Library } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { RecordPlayObserver } from "./components/record-play-observer";
import { PlaybackFields } from "./components/playback-fields";

export { usePlaybackHistory, usePlaybackHistoryMap } from "./hooks";

export default {
  description:
    "Per-song play count + last-played: records a play on playback start (Sonata.Effect), and contributes Plays / Last-played fields (Library.Fields) so they appear on the library card, in the DataView's sort and filter pills, and as table columns.",
  contributions: [
    Sonata.Effect({ id: "record-play", component: RecordPlayObserver }),
    Library.Fields({
      id: "playback",
      section: null,
      component: PlaybackFields,
    }),
  ],
} satisfies PluginDefinition;
