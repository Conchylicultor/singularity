import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * Downloaded YouTube audio: `<videoId>.<ext>` (the stream as served) beside
 * `<videoId>.json` (what yt-dlp said about it, written last), plus
 * `locks/<videoId>.lock`, the host-wide flock one download holds.
 *
 * `cache`, and genuinely so: any file is downloaded again when missing. Host-wide
 * on purpose: every worktree on the machine shares one download per video. The
 * daily `youtube-audio.sweep` bounds it (30 days unused, then 2 GB).
 */
export const youtubeAudioCacheDir = defineDataDir({
  kind: "cache",
  name: "youtube-audio",
  owner: "integrations/youtube/audio-fetch",
  description:
    "Downloaded YouTube audio streams (one per video, with its yt-dlp metadata), re-downloaded when missing",
  reclaim: { kind: "safe" },
});

export default [youtubeAudioCacheDir];
