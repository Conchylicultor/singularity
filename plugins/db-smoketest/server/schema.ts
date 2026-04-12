import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const smoketest = pgTable("smoketest", {
  id: text("id").primaryKey(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
