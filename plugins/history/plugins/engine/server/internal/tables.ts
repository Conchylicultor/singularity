import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// One row per stored version. 1:N (a versioning table — NOT a 1:1
// entity-extension side-table). Domain-agnostic: the engine never knows what a
// `source_id` is, and `snapshot` is an OPAQUE per-source payload. There is
// deliberately NO foreign key to any consumer table (e.g. page_blocks) — orphan
// cleanup is the consumer's job via `deleteVersions`. The
// (source_id, entity_id, created_at) index serves the per-entity timeline query
// and is the seam for a future age/count pruning job.
export const _entityVersions = pgTable(
  "entity_versions",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    entityId: text("entity_id").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    label: text("label"),
    author: text("author"),
    // A pinned version is an immutable checkpoint (e.g. the pre-restore undo
    // point, or a future manual "named version"): time-bucket coalescing never
    // overwrites it, so it always survives as a distinct point in the timeline.
    // Auto-snapshots are unpinned and coalesce within the active-editing window.
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("entity_versions_source_entity_created_idx").on(
      t.sourceId,
      t.entityId,
      t.createdAt,
    ),
  ],
);
