import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Library } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { RecordPlayObserver } from "./components/record-play-observer";
import { PlayStats } from "./components/play-stats";
import { MostPlayedOrder, RecentlyPlayedOrder } from "./components/sort-orders";

export { usePlaybackHistory, usePlaybackHistoryMap } from "./hooks";

export default {
  description:
    "Per-song play count + last-played: records a play on playback start (Sonata.Effect), shows stats on each library card (Library.CardMeta), and adds Most/Recently played sort orderings (Library.Sort).",
  contributions: [
    Sonata.Effect({ id: "record-play", component: RecordPlayObserver }),
    Library.CardMeta({ id: "play-stats", component: PlayStats }),
    Library.Sort({
      match: "most-played",
      id: "most-played",
      label: "Most played",
      component: MostPlayedOrder,
    }),
    Library.Sort({
      match: "recently-played",
      id: "recently-played",
      label: "Recently played",
      component: RecentlyPlayedOrder,
    }),
  ],
} satisfies PluginDefinition;
