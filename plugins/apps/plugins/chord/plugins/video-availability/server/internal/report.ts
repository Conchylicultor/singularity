import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  statusFromPlayerCode,
  type ObservedVideoStatus,
  type PlaybackReport,
  type VideoStatus,
} from "../../core";
import { _chordVideos } from "./tables";
import { chordVideoStatus } from "./views";

function playerObservation(report: PlaybackReport): {
  playerStatus: ObservedVideoStatus | null;
  playerCode: number | null;
} {
  if (report.outcome === "playing")
    return { playerStatus: "ok", playerCode: null };
  const verdict = statusFromPlayerCode(report.code);
  return {
    playerStatus: verdict.kind === "decided" ? verdict.status : null,
    playerCode: report.code,
  };
}

/**
 * Record what the player saw into the player's own three columns — oEmbed's
 * evidence is never touched — and answer the video's status as the view now
 * resolves it.
 *
 * The columns hold the player's LAST report. An error code that says nothing
 * about availability (5, an HTML5 player fault) records the code with a null
 * status, so the verdict falls back to oEmbed's until the player tries again.
 */
export async function recordPlayerReport(
  videoId: string,
  report: PlaybackReport,
): Promise<VideoStatus> {
  await db
    .insert(_chordVideos)
    .values({
      videoId,
      ...playerObservation(report),
      playerCheckedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: _chordVideos.videoId,
      set: {
        playerStatus: sql`excluded.player_status`,
        playerCode: sql`excluded.player_code`,
        playerCheckedAt: sql`excluded.player_checked_at`,
      },
    });

  const [row] = await db
    .select({ status: chordVideoStatus.status })
    .from(chordVideoStatus)
    .where(eq(chordVideoStatus.videoId, videoId));
  if (row === undefined) {
    throw new Error(
      `chord_video_status_v has no row for ${videoId} right after its report was written`,
    );
  }
  return row.status;
}
