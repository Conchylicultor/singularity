import { and, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { chordVideoStatus } from "@plugins/apps/plugins/chord/plugins/video-availability/server";
import type { SongVideoSource } from "@plugins/integrations/plugins/youtube/plugins/song-videos/server";
import { playableVideoWhere } from "./find";
import { hooktheorySlugs } from "./hooktheory-slug";
import { loadIndexStatus } from "./state";
import { _chordSections } from "./tables";

const s = _chordSections;

function requireVideoId(videoId: string | null): string {
  if (videoId === null) {
    throw new Error("hooktheory song videos: a group with no video id");
  }
  return videoId;
}

/**
 * Hooktheory's videos of a song, as a `SongVideos.Source`: the YouTube videos
 * TheoryTab transcribers synced this song's sections to — `human-synced`, the
 * strongest evidence a video is the recording the chords describe.
 *
 * - Looked up by slug (`hooktheorySlugs` of the artist and the title, through
 *   the `(artist_slug, song_slug)` index), grouped by video, the video most
 *   sections were synced to first.
 * - Videos the trainer already knows will not play (gone, not embeddable)
 *   are left out, by the same rule the loop query uses.
 * - `unavailable` unless the index is loaded: it is loaded only where the Chord
 *   app was opened, and a lookup must not start a ~26k-section load on someone
 *   else's behalf. A worktree holds a 1-in-20 sample, so it finds less.
 */
export const hooktheorySongVideos: SongVideoSource = {
  id: "hooktheory",
  async find(query) {
    const status = await loadIndexStatus();
    if (status.kind !== "ready") {
      return {
        kind: "unavailable",
        reason: `the Chord song index is ${status.kind === "loading" ? "loading" : status.kind}`,
      };
    }
    const artistSlugs = hooktheorySlugs(query.artist);
    const songSlugs = hooktheorySlugs(query.title);
    if (artistSlugs.length === 0 || songSlugs.length === 0) {
      return { kind: "answered", videos: [] };
    }
    const rows = await db
      .select({
        videoId: s.videoId,
        durationSec: max(s.videoDurationSeconds),
      })
      .from(s)
      .leftJoin(chordVideoStatus, eq(chordVideoStatus.videoId, s.videoId))
      .where(
        and(
          inArray(s.artistSlug, artistSlugs),
          inArray(s.songSlug, songSlugs),
          isNotNull(s.videoId),
          playableVideoWhere(),
        ),
      )
      .groupBy(s.videoId)
      .orderBy(desc(sql`count(*)`), s.videoId);
    return {
      kind: "answered",
      videos: rows.map((row) => ({
        // Grouped over `video_id IS NOT NULL` rows: a null here is a broken query.
        videoId: requireVideoId(row.videoId),
        // The dump names the song, not the video: oEmbed names it later.
        title: null,
        channel: null,
        durationSec: row.durationSec,
        evidence: "human-synced" as const,
      })),
    };
  },
};
