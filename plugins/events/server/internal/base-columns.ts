import { boolean, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Shared columns applied to every trigger table via `defineTriggerEvent`.
// Named once here so dispatch can rely on property names (actionName,
// actionConfig, oneShot, enabled, id) being stable across tables.
export const eventTriggerColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  actionName: text("action_name").notNull(),
  actionConfig: jsonb("action_config").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  oneShot: boolean("one_shot").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
