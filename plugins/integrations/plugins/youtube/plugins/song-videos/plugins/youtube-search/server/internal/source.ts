import type { SongVideoSource } from "@plugins/integrations/plugins/youtube/plugins/song-videos/server";
import { searchYouTube } from "@plugins/integrations/plugins/youtube/server";

/** Results asked for: one page, enough to hold the studio audio, the video and a few versions. */
const SEARCH_LIMIT = 10;

/**
 * YouTube's own results for "<artist> <title>", in its order. Scraping
 * (yt-dlp's flat search), so it can fail: it then throws, and the lookup
 * reports it while the other sources still count.
 */
export const youtubeSearchSource: SongVideoSource = {
  id: "youtube-search",
  async find(query, exec, { log }) {
    const results = await searchYouTube(
      `${query.artist} ${query.title}`,
      exec,
      { limit: SEARCH_LIMIT, log },
    );
    return {
      kind: "answered",
      videos: results.map((r) => ({ ...r, evidence: "search" as const })),
    };
  },
};
