import { pgTable, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";

// Worktree-local holding area for config documents staged as "default for
// everyone". Last-write-wins per (plugin_id, config_name) — the composite key
// that derives the on-disk config storePath. Rows are written by the stage
// endpoint, read by the live resource + review section, and consumed (deleted)
// by apply/discard. The full `value` document is validated against the
// descriptor schema at apply time, not at write time — see handlers.ts.
export const _stagedConfigDefault = pgTable(
  "staged_config_default",
  {
    pluginId: text("plugin_id").notNull(), // dot-form; server derives the config path
    configName: text("config_name").notNull(), // descriptor config name
    value: jsonb("value").notNull(), // full config document (field-map object)
    authorId: text("author_id"), // conversation id or null
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.pluginId, t.configName] })],
);
