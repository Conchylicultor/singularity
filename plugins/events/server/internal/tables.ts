import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Capped ring-buffer log of every emit() call. Written from dispatch() in
// event.ts, including zero-match emits — that case is the primary debugging
// value ("my trigger didn't fire, why"). Pruned inline to ~EMISSIONS_CAP rows
// so the table stays bounded without a background job.
export const _event_emissions = pgTable(
  "event_emissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventName: text("event_name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    matchedCount: integer("matched_count").notNull(),
    matchedTriggerIds: jsonb("matched_trigger_ids").$type<string[]>().notNull(),
    emittedAt: timestamp("emitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_emissions_emitted_at_idx").on(t.emittedAt)],
);

export const EMISSIONS_CAP = 1000;
