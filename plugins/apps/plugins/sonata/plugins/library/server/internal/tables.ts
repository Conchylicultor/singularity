import { doublePrecision, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Physical table — **source-agnostic** generic metadata only. Per-source raw
// (MIDI attachment, chord-grid JSON, …) lives in each source plugin's own
// `sonata_songs_ext_<source>` entity-extension table (FK CASCADE on delete), so
// adding a source never touches this schema. Kept free of the server-only
// `Attachments` import: the generic song↔attachment link lives in its
// `schema-attachments.ts` sibling. Mirrors tasks-core/server/internal/tables.ts.
export const _songs = pgTable("sonata_songs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  composer: text("composer"),
  // Score-level (composed-timeline) length — not tied to any one source.
  durationSec: doublePrecision("duration_sec").notNull(),
  endBeat: doublePrecision("end_beat").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
