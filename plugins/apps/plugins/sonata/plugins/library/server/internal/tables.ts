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
  // Opaque id of the input source that created this song (its `Library.Source` /
  // `Sonata.Source` id). Immutable, stamped once by `createSongRow`. The library
  // never enumerates source ids — it stores whatever the creating source passes;
  // display labels are resolved through the generic `Sonata.Source` registry.
  // No DB default: `createSongRow` is the sole insert path and always supplies a
  // source, so the NOT NULL constraint is the real guarantee (a source-less
  // insert must fail loudly rather than silently default). The add-column
  // migration carried a temporary '' default only so the column could apply to
  // pre-existing rows; the backfill migration then set the real ids and the
  // follow-up schema migration drops that default.
  source: text("source").notNull(),
});
