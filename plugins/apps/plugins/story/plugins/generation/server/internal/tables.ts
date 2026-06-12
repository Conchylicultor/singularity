import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { GenStatus } from "../../core";

// One row per (page, kind, unit). `kind` is the rendererId (e.g. "blog");
// `unitId` is a renderer-derived stable id ("article" for blog v1, a node id
// once segmented). Whole-artifact = all rows for (pageId, kind).
export const _storyGeneratedUnits = pgTable(
  "story_generated_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: text("page_id").notNull(),
    kind: text("kind").notNull(),
    unitId: text("unit_id").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").$type<GenStatus>().notNull(),
    output: text("output"),
    prompt: text("prompt"),
    instruction: text("instruction"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("story_generated_units_pk_idx").on(t.pageId, t.kind, t.unitId)],
);
