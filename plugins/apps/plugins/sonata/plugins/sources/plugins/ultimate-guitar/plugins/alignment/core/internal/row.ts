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
 * Where a song's alignment stands. `aligned` and `weak` both hold a record;
 * only `aligned` is applied to the Score (a weak match is kept to show its
 * score, never played).
 */
export const AlignmentStatusSchema = z.enum([
  "queued",
  "running",
  "aligned",
  "weak",
  "failed",
]);
export type AlignmentStatus = z.infer<typeof AlignmentStatusSchema>;

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
    record: jsonField<AlignmentRecord | null>({
      schema: AlignmentRecordSchema.nullable(),
      default: null,
    }),
  },
  wireTimestamps: ["updatedAt"],
});
export const UgAlignmentRowSchema = ugAlignmentShape.schema;
export type UgAlignmentRow = z.infer<typeof UgAlignmentRowSchema>;
