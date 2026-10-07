import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// Server-side YouTube: whether a video plays in an embed (oEmbed), and search
// (yt-dlp, the `youtube-audio` dependency this plugin declares).
export { checkOembed } from "./internal/oembed";
export type { OembedCheck } from "./internal/oembed";
export { searchYouTube, searchYouTubeWith } from "./internal/search";
export type { SearchOptions, YouTubeSearchResult } from "./internal/search";

export default {
  description:
    "Server-side YouTube: checkOembed(videoId) asks oEmbed whether a video plays in an embed (status code mapped by the core's statusFromOembedCode, plus the title and channel of a 200), and searchYouTube(query, exec) lists YouTube's results for a query (id, title, channel, duration, views, verified, art track) through yt-dlp's flat search, from the on-demand `youtube-audio` dependency this plugin owns.",
} satisfies ServerPluginDefinition;
