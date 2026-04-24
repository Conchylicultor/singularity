import { boolean, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Shared columns applied to every trigger table via `defineTriggerEvent`.
// Named once here so dispatch can rely on property names (jobName, jobWith,
// oneShot, enabled, id) being stable across tables.
export const eventTriggerColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  jobName: text("job_name").notNull(),
  jobWith: jsonb("job_with").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  oneShot: boolean("one_shot").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
