import { defineDep } from "@plugins/infra/plugins/deps/deps";
import { pythonEnv } from "@plugins/infra/plugins/deps/plugins/python/deps";

/**
 * yt-dlp and yt-dlp-ejs, in their own Python project so the (roughly weekly)
 * yt-dlp bump the `uv` updater makes reinstalls ≈15 MB and nothing else.
 *
 * Owned by `integrations/youtube` itself, not by one of its children: both the
 * audio download (`audio-fetch`, `youtube_audio.fetch`) and the search
 * (`searchYouTube`, `youtube_audio.search`) run modules of this one project.
 * The id keeps its first name, `youtube-audio`, so the installed env carries
 * over.
 */
export const ytDlpDep = defineDep({
  id: "youtube-audio",
  owner: "integrations/youtube",
  description: "yt-dlp, to search YouTube and download a video's audio",
  sizeHint: "≈15 MB",
  source: pythonEnv({
    project: "plugins/integrations/plugins/youtube/python",
  }),
});
