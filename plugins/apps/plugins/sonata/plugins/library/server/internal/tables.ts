import {
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Physical table only. Kept free of the server-only `Attachments` import: the
// attachment link (which would drag postgres into anything reachable from the
// web bundle) lives in its `schema-attachments.ts` sibling. Mirrors
// tasks-core/server/internal/tables.ts and page/image's tables.ts conventions.
export const _songs = pgTable("sonata_songs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  composer: text("composer"),
  midiAttachmentId: text("midi_attachment_id").notNull(),
  durationSec: doublePrecision("duration_sec").notNull(),
  endBeat: doublePrecision("end_beat").notNull(),
  // Note-bearing MIDI track count, file-derived at import/seed. Immutable.
  // Nullable: unknown for any row created before this column existed.
  midiTrackCount: integer("midi_track_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
