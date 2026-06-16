import { sql } from "drizzle-orm";
import {
  customType,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

// Postgres `tsvector` column type. Single-word data type so drizzle-kit emits it
// verbatim (the multi-word double-quoting bug that bit rank_text doesn't apply).
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

// One row per navigable entity, keyed by (source, entityId). Domain-agnostic:
// the engine never knows what a "source" is — each consumer owns what it indexes
// and how it navigates on select. `title` is weighted above `body` (A vs B) in
// the generated tsvector so title matches rank higher. The GIN index on `tsv`
// makes `tsv @@ query` an index scan, not a seq scan.
export const _searchDocuments = pgTable(
  "search_documents",
  {
    source: text("source").notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    route: text("route").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    tsv: tsvector("tsv").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`setweight(to_tsvector('english', coalesce(title,'')), 'A') || setweight(to_tsvector('english', coalesce(body,'')), 'B')`,
    ),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.entityId] }),
    index("search_documents_tsv_idx").using("gin", t.tsv),
    index("search_documents_source_idx").on(t.source),
  ],
);
