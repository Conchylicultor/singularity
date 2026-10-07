import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { youtubeVideoId } from "@plugins/integrations/plugins/youtube/core";
import { songUltimateGuitar } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/server";
import {
  getUgAlignment,
  realignUg,
  refuseUgAlignmentVideo,
  resolveUgAlignment,
  setUgAlignmentVideo,
} from "../../core";
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
      pick: row.pick,
      candidates: row.candidates,
      record: row.record,
      updatedAt: row.updatedAt,
    };
  },
);

/**
 * Set the recording from a pasted link (or a candidate's id) and queue an
 * alignment to it. The user's pick: nothing automatic replaces it, and a
 * resolver run in progress stops at its next step. The record of a previous
 * video stays until the new one lands (it no longer applies: `appliedAlignment`
 * and the job both compare its `videoId`).
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
      pick: "user",
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

/** "Find a video": forget the video and the candidates, and let the resolver choose. */
export const handleResolveUgAlignment = implement(
  resolveUgAlignment,
  async ({ params }) => {
    await requireUgSong(params.id);
    await songUgAlignment.upsert(params.id, {
      videoId: null,
      pick: "auto",
      status: "queued",
      phase: null,
      error: null,
      errorPermanent: false,
      record: null,
      candidates: [],
    });
    await ugAlignJob.enqueue({ songId: params.id });
    return { ok: true as const };
  },
);

/**
 * The embedded player refused a video. Its candidate becomes `not-embeddable`
 * (or `failed` for a video that is gone); when the resolver had picked it, the
 * pick moves on to the next untried candidate (the job's resolve arm, without
 * searching again). A user's pick is left as it is: the player shows the
 * refusal. Idempotent: the panel reports again whenever it remounts on the
 * same refused video, and a repeat finds nothing to change.
 */
export const handleRefuseUgAlignmentVideo = implement(
  refuseUgAlignmentVideo,
  async ({ params, body }) => {
    const row = await songUgAlignment.get(params.id);
    if (row === undefined) {
      throw new HttpError(404, `Song ${params.id} has no alignment.`);
    }
    const outcome =
      body.status === "gone"
        ? ("failed" as const)
        : ("not-embeddable" as const);
    const candidates = row.candidates.map((c) =>
      c.videoId === body.videoId && c.outcome !== outcome
        ? {
            ...c,
            outcome,
            score: null,
            error:
              outcome === "failed" ? "YouTube says the video is gone" : null,
          }
        : c,
    );
    const repick = row.pick === "auto" && row.videoId === body.videoId;
    if (!repick) {
      // Recorded for the candidate list; nothing else moves.
      if (candidates.some((c, i) => c !== row.candidates[i])) {
        await songUgAlignment.upsert(params.id, {
          status: row.status,
          candidates,
        });
      }
      return { resolving: false };
    }
    // The refused video's record goes too: with no video chosen, the row's
    // record is what plays (the resolver's best try), and this one cannot.
    await songUgAlignment.upsert(params.id, {
      videoId: null,
      status: "queued",
      phase: null,
      error: null,
      errorPermanent: false,
      candidates,
      record: null,
    });
    await ugAlignJob.enqueue({ songId: params.id });
    return { resolving: true };
  },
);
