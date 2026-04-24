import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Polymorphic attachments: `owner_type` + `owner_id` are free-form strings
// rather than a hard FK, so new consumers (tasks today; conversations/crashes
// later) plug in without schema changes. Integrity is enforced in code.
// Staged uploads have owner_type = owner_id = NULL until the consumer calls
// `/api/attachments/:id/attach` to link them.
export const _attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    ownerType: text("owner_type"),
    ownerId: text("owner_id"),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    diskPath: text("disk_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("attachments_owner_idx").on(t.ownerType, t.ownerId),
    index("attachments_staged_idx")
      .on(t.createdAt)
      .where(sql`${t.ownerId} is null`),
  ],
);
