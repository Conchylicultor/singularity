import { z } from "zod";
import { nullable, type FieldsRecord } from "@plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { wireSchema } from "@plugins/infra/plugins/entities/core";

// One persisted per-(song, track) view override. `color` is nullable: null means
// "no override — fall back to the palette default for the track's index".
// `instrument` is likewise nullable: null means "auto" — derive the timbre from
// the track's GM program, else the default instrument. `muted` silences the
// track in the audio scheduler; `hidden` removes its notes from the piano-roll.
// Both default to false so an absent row reads as "audible + visible".
//
// The physical table (server) and the wire schema both derive from this single
// `trackViewFields` record; the created/updated timestamps stay in the DDL but
// are kept off the wire via `TRACK_VIEW_SERVER_ONLY`.
export const trackViewFields = {
  songId:     textField(),
  trackId:    textField(),
  color:      nullable(textField()),
  instrument: nullable(textField()),
  muted:      boolField(),
  hidden:     boolField(),
  createdAt:  dateField(),
  updatedAt:  dateField(),
} satisfies FieldsRecord;

// Columns present in the table DDL but omitted from the wire schema (and never
// fetched by the loader): the created/updated timestamps the client never reads.
export const TRACK_VIEW_SERVER_ONLY = ["createdAt", "updatedAt"] as const;

// Client-facing row shape — 6 fields (omits the timestamps). Browser-safe.
export const TrackViewRowSchema = wireSchema(
  trackViewFields,
  TRACK_VIEW_SERVER_ONLY,
);
export type TrackViewRow = z.infer<typeof TrackViewRowSchema>;
