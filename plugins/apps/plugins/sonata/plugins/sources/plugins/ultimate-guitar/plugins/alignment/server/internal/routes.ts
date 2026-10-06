import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { youtubeVideoId } from "@plugins/integrations/plugins/youtube/core";
import { songUltimateGuitar } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/server";
import { getUgAlignment, realignUg, setUgAlignmentVideo } from "../../core";
import { ugAlignJob } from "./job";
import { songUgAlignment } from "./tables";

/** 404 unless the song carries a UG tab — only a UG sheet can be aligned. */
async function requireUgSong(songId: string): Promise<void> {
  if ((await songUltimateGuitar.get(songId)) === undefined) {
    throw new HttpError(404, `Song ${songId} has no Ultimate Guitar tab.`);
  }
}

/** The song's alignment row (wire columns), or null when it never had a video. */
export const handleGetUgAlignment = implement(
  getUgAlignment,
  async ({ params }) => {
    const row = await songUgAlignment.get(params.id);
    if (row === undefined) return null;
    return {
      songId: row.songId,
      videoId: row.videoId,
      status: row.status,
      phase: row.phase,
      error: row.error,
      errorPermanent: row.errorPermanent,
      record: row.record,
      updatedAt: row.updatedAt,
    };
  },
);

/**
 * Set the recording from a pasted link and queue an alignment to it. The record
 * of a previous video stays until the new one lands (it no longer applies:
 * `isApplicable` and the job both compare its `videoId`).
 */
export const handleSetUgAlignmentVideo = implement(
  setUgAlignmentVideo,
  async ({ params, body }) => {
    const videoId = youtubeVideoId(body.url);
    if (videoId === null) {
      throw new HttpError(400, "That is not a YouTube video link.");
    }
    await requireUgSong(params.id);
    await songUgAlignment.upsert(params.id, {
      videoId,
      status: "queued",
      phase: null,
      error: null,
      errorPermanent: false,
    });
    await ugAlignJob.enqueue({ songId: params.id });
    return { videoId };
  },
);

/** Align again to the current video, even when the record is current (`queued` forces a run). */
export const handleRealignUg = implement(realignUg, async ({ params }) => {
  const row = await songUgAlignment.get(params.id);
  if (row === undefined || row.videoId === null) {
    throw new HttpError(409, "Set a YouTube video before aligning.");
  }
  await songUgAlignment.upsert(params.id, {
    status: "queued",
    phase: null,
    error: null,
    errorPermanent: false,
  });
  await ugAlignJob.enqueue({ songId: params.id });
  return { ok: true as const };
});
