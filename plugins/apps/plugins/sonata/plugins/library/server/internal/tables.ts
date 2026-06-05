import { doublePrecision, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
