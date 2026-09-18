import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { youtubeVideoId } from "@plugins/integrations/plugins/hooktheory/core";
import {
  reportPlaybackEndpoint,
  videoStatusSummaryEndpoint,
  type VideoStatusCounts,
} from "../../core";
import { recordPlayerReport } from "./report";
import { chordVideoStatus } from "./views";

export const handleReportPlayback = implement(
  reportPlaybackEndpoint,
  async ({ params, body }) => {
    // A bare id only, by the rule the index parsed its video ids with: a
    // report must not mint a row for something that is not a video id.
    if (youtubeVideoId(params.videoId) !== params.videoId) {
      throw new HttpError(400, `not a YouTube video id: ${params.videoId}`);
    }
    return { status: await recordPlayerReport(params.videoId, body) };
  },
);

export const handleVideoStatusSummary = implement(
  videoStatusSummaryEndpoint,
  async () => {
    const rows = await db
      .select({
        status: chordVideoStatus.status,
        count: sql`count(*)::int`.mapWith(Number),
      })
      .from(chordVideoStatus)
      .groupBy(chordVideoStatus.status);
    const byStatus: VideoStatusCounts = {
      unknown: 0,
      ok: 0,
      gone: 0,
      "not-embeddable": 0,
    };
    for (const row of rows) byStatus[row.status] = row.count;
    return {
      videos: rows.reduce((sum, row) => sum + row.count, 0),
      byStatus,
    };
  },
);
