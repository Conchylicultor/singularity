import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  loadYouTubeIframeApi,
  YouTubeIframeApiLoadError,
  type YTNamespace,
  type YTPlayer,
} from "./internal/iframe-api";
export {
  YouTubePlayerNotReadyError,
  type YouTubePlaybackState,
  type YouTubePlayerCallbacks,
  type YouTubePlayerController,
  type YouTubePlayerState,
  type YouTubeRange,
} from "./internal/controller";
export {
  useYouTubePlayer,
  useYouTubePlayerState,
  useYouTubePlayhead,
} from "./internal/hooks";
export {
  YouTubePlayer,
  type YouTubePlayerProps,
} from "./components/youtube-player";

export default {
  description:
    "Embedded YouTube player the app controls: loadYouTubeIframeApi (the IFrame API, loaded once), <YouTubePlayer controller videoId loop autoplay onReady onPlaying onError onStateChange/> bound to a useYouTubePlayer() controller (play, pause, isPlaying, playRange for one pass then back to the loop, seek, getCurrentTime, getDuration), useYouTubePlayerState, and useYouTubePlayhead (one read per animation frame while playing). Loops without polling: one timer to the loop's end, reset on every state change.",
  contributions: [],
} satisfies PluginDefinition;
