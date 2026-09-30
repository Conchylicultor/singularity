import { defineDep } from "@plugins/infra/plugins/deps/deps";
import { pythonEnv } from "@plugins/infra/plugins/deps/plugins/python/deps";

/**
 * yt-dlp and yt-dlp-ejs, in their own Python project so the (roughly weekly)
 * yt-dlp bump the `uv` updater makes reinstalls ≈15 MB and nothing else.
 */
export const youtubeAudioDep = defineDep({
  id: "youtube-audio",
  owner: "integrations/youtube/audio-fetch",
  description: "yt-dlp, to download a YouTube video's audio",
  sizeHint: "≈15 MB",
  source: pythonEnv({
    project: "plugins/integrations/plugins/youtube/plugins/audio-fetch/python",
  }),
});
