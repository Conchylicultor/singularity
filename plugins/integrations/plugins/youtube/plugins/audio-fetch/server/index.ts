import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { youtubeAudioSweepJob } from "./internal/sweep-job";

export {
  fetchYouTubeAudio,
  YouTubeAudioUnavailableError,
} from "./internal/fetch";
export type { FetchOptions, YouTubeAudio } from "./internal/fetch";

export default {
  description:
    "YouTube audio download: fetchYouTubeAudio(videoId, exec) returns one video's best audio stream as served (webm/opus or m4a, no ffmpeg), downloaded by yt-dlp — JavaScript challenges solved on bun — from the on-demand `youtube-audio` Python dependency into a host-wide cache under a per-video host flock; a hit is a file read. A video YouTube will not serve throws YouTubeAudioUnavailableError (non-retryable). The daily youtube-audio.sweep keeps the cache within 30 days unused and 2 GB.",
  register: [youtubeAudioSweepJob],
} satisfies ServerPluginDefinition;
