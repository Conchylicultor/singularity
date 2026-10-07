import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { SongVideos } from "@plugins/integrations/plugins/youtube/plugins/song-videos/server";
import { youtubeSearchSource } from "./internal/source";

export default {
  description:
    "The youtube-search song-video source: YouTube's first ten results for \"<artist> <title>\" (yt-dlp's flat search: title, channel, duration, views, verified, art track), contributed to SongVideos.Source.",
  contributions: [SongVideos.Source(youtubeSearchSource)],
} satisfies ServerPluginDefinition;
