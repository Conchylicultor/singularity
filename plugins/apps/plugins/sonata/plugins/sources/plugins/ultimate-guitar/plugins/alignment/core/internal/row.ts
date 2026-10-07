import { z } from "zod";
import { nullable } from "@plugins/fields/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import {
  parsedTextField,
  textField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { AlignmentRecordSchema, type AlignmentRecord } from "./record";

/**
 * Where a song's alignment stands. `aligned` and `weak` both hold a record,
 * and both are applied to the Score (`appliedAlignment`): a weak match plays,
 * labelled unconfirmed with its score.
 *
 * Choosing the video automatically (`pick: "auto"`) adds two: `resolving` —
 * finding candidates and aligning them one by one — and `needs-video`, when
 * none of the candidates tried aligned well enough (the best weak record is
 * kept, and played the same way, while the user is asked for a better video).
 */
export const AlignmentStatusSchema = z.enum([
  "queued",
  "resolving",
  "running",
  "aligned",
  "weak",
  "needs-video",
  "failed",
]);
export type AlignmentStatus = z.infer<typeof AlignmentStatusSchema>;

/**
 * Who chose the video: the resolver (`auto`, which may move to another
 * candidate) or the user (`user`, which nothing automatic overrides).
 */
export const VideoPickSchema = z.enum(["auto", "user"]);
export type VideoPick = z.infer<typeof VideoPickSchema>;

/**
 * What became of one candidate video: not tried yet, being tried, aligned well
 * enough (it became the video), a weak match, failed (its audio could not be
 * had: YouTube will not serve it, or its download failed), or refused by the
 * embedded player.
 */
export const CandidateOutcomeSchema = z.enum([
  "untried",
  "trying",
  "aligned",
  "weak",
  "failed",
  "not-embeddable",
]);
export type CandidateOutcome = z.infer<typeof CandidateOutcomeSchema>;

/** One video the resolver found, in its rank order, and how trying it went. */
export const AlignmentCandidateSchema = z.object({
  videoId: z.string(),
  title: z.string().nullable(),
  channel: z.string().nullable(),
  /** Its position in the ranking, 0 = the best. */
  rank: z.number().int().nonnegative(),
  /** The sources that found it (`hooktheory`, `youtube-search`). */
  sources: z.array(z.string()),
  outcome: CandidateOutcomeSchema,
  /** The alignment score once tried; null untried, failed or refused. */
  score: z.number().min(0).max(1).nullable(),
  /**
   * Why it `failed` (yt-dlp's reason), else null. Defaulted for candidates
   * written before it existed.
   */
  error: z.string().nullable().default(null),
});
export type AlignmentCandidate = z.infer<typeof AlignmentCandidateSchema>;

/** What a `running` job is doing: analysing the recording, or aligning the sheet to it. */
export const AlignmentPhaseSchema = z.enum(["analysing", "aligning"]);
export type AlignmentPhase = z.infer<typeof AlignmentPhaseSchema>;

// The `sonata_songs_ext_ug_alignment` row, declared once: the server builds the
// side-table from this shape, and the live row and the get endpoint's response
// are its `schema`. The `default`s are wire defaults only — every write that
// inserts a row sets `status`.
//
// `record` is a nullable jsonb decoded by `AlignmentRecordSchema` on every read
// and write. It is declared as a `jsonField` of `AlignmentRecord | null` rather
// than `nullable(jsonField(...))`, which would demand a stand-in record as the
// (discarded) inner default.
export const ugAlignmentShape = defineExtensionShape({
  key: "songId",
  fields: {
    videoId: nullable(textField()),
    status: parsedTextField(AlignmentStatusSchema, { default: "queued" }),
    phase: nullable(
      parsedTextField(AlignmentPhaseSchema, { default: "analysing" }),
    ),
    error: nullable(textField()),
    /** The failure will not go away by retrying (the video is unavailable). */
    errorPermanent: boolField(),
    /** Who chose `videoId`. A row from before automatic picking is `user` (the DB default). */
    pick: parsedTextField(VideoPickSchema, { default: "user" }),
    /** The resolver's candidates, best first; empty until it has searched. */
    candidates: jsonField<AlignmentCandidate[]>({
      schema: z.array(AlignmentCandidateSchema),
      default: [],
    }),
    record: jsonField<AlignmentRecord | null>({
      schema: AlignmentRecordSchema.nullable(),
      default: null,
    }),
  },
  wireTimestamps: ["updatedAt"],
});
export const UgAlignmentRowSchema = ugAlignmentShape.schema;
export type UgAlignmentRow = z.infer<typeof UgAlignmentRowSchema>;
