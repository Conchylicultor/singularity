import { z } from "zod";
import { VideoIdSchema } from "@plugins/integrations/plugins/youtube/core";

/** The song to find videos of, as a sheet names it. */
export const SongQuerySchema = z.object({
  artist: z.string(),
  title: z.string(),
});
export type SongQuery = z.infer<typeof SongQuerySchema>;

/**
 * How a source knows a video is the song:
 *
 * - `human-synced` — a person synced this song's chords to this video (a
 *   Hooktheory transcription): strong evidence it is the right recording.
 * - `search` — it came up when searching for the song: only its title,
 *   channel and duration say whether it is.
 */
export const VideoEvidenceSchema = z.enum(["human-synced", "search"]);
export type VideoEvidence = z.infer<typeof VideoEvidenceSchema>;

/** One video as one source returned it. A field the source does not know is null. */
export interface SourceVideo {
  videoId: string;
  title: string | null;
  channel: string | null;
  durationSec: number | null;
  evidence: VideoEvidence;
  viewCount?: number | null;
  /** The channel carries YouTube's verified badge. */
  channelVerified?: boolean | null;
  /** An auto-generated art track ("Provided to YouTube by …", a "- Topic" channel's upload). */
  artTrack?: boolean | null;
}

/**
 * One source's answer. `unavailable` is a state of the source (its data is not
 * loaded on this instance), never an empty list: an empty `videos` means the
 * source looked and found nothing.
 */
export type SourceAnswer =
  | { kind: "answered"; videos: SourceVideo[] }
  | { kind: "unavailable"; reason: string };

/** Where a candidate came from: which source, how it knows, and its position in that source's list (0-based). */
export const CandidateSourceSchema = z.object({
  source: z.string(),
  evidence: VideoEvidenceSchema,
  rank: z.number().int().nonnegative(),
});
export type CandidateSource = z.infer<typeof CandidateSourceSchema>;

/** One video, merged over every source that returned it. */
export const VideoCandidateSchema = z.object({
  videoId: VideoIdSchema,
  title: z.string().nullable(),
  channel: z.string().nullable(),
  durationSec: z.number().nullable(),
  viewCount: z.number().nullable(),
  channelVerified: z.boolean(),
  artTrack: z.boolean(),
  sources: z.array(CandidateSourceSchema).min(1),
});
export type VideoCandidate = z.infer<typeof VideoCandidateSchema>;

/**
 * Merge the sources' answers into one candidate per video, in first-seen
 * order (sources in the order given, each in its own order). A video several
 * sources returned lists each of them, and takes each field from the first
 * source that knew it. Unavailable sources contribute nothing.
 */
export function mergeSourceAnswers(
  answers: readonly { source: string; answer: SourceAnswer }[],
): VideoCandidate[] {
  const byId = new Map<string, VideoCandidate>();
  for (const { source, answer } of answers) {
    if (answer.kind !== "answered") continue;
    answer.videos.forEach((video, rank) => {
      const from: CandidateSource = { source, evidence: video.evidence, rank };
      const known = byId.get(video.videoId);
      if (known === undefined) {
        byId.set(video.videoId, {
          videoId: video.videoId,
          title: video.title,
          channel: video.channel,
          durationSec: video.durationSec,
          viewCount: video.viewCount ?? null,
          channelVerified: video.channelVerified === true,
          artTrack: video.artTrack === true,
          sources: [from],
        });
        return;
      }
      // The same video listed twice by one source keeps its first position.
      if (!known.sources.some((s) => s.source === source)) {
        known.sources.push(from);
      }
      known.title ??= video.title;
      known.channel ??= video.channel;
      known.durationSec ??= video.durationSec;
      known.viewCount ??= video.viewCount ?? null;
      known.channelVerified ||= video.channelVerified === true;
      known.artTrack ||= video.artTrack === true;
    });
  }
  return [...byId.values()];
}
