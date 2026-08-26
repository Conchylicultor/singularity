import { z } from "zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import { TweakcnPresetsSchema } from "../../core";

export const _tweakcnThemes = pgTable("tweakcn_themes", {
  id: text("id").primaryKey(),
  tweakcnId: text("tweakcn_id").notNull().unique(),
  label: text("label").notNull(),
  // The theme export exactly as tweakcn.com served it — arbitrary keys, so
  // `z.record` verifies it is an object and keeps every one of them.
  rawJson: parsedJson("raw_json", z.record(z.string(), z.unknown())).notNull(),
  // The converted per-token-group presets, decoded by the same schema the list
  // endpoint's response declares.
  presets: parsedJson("presets", TweakcnPresetsSchema).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
