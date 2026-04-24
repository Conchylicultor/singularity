import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Attachments are bytes on disk referenced by UUID. Ownership is tracked in
// per-consumer link tables declared via `Attachments.defineLink(ownerTable)`
// — see `./define-link.ts`. A row in this table survives as long as any
// registered link references it; the orphan sweep collects unreferenced rows
// past a TTL (covers the upload→link race and owner-deletion cascades alike).
export const _attachments = pgTable("attachments", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  diskPath: text("disk_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
