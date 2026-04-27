import { getTableName } from "drizzle-orm";
import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
  type PgTable,
} from "drizzle-orm/pg-core";
import { _attachments } from "./tables";

type OwnerTable = PgTable & { id: AnyPgColumn };

export interface AttachmentLinkSource {
  table: PgTable;
  attachmentIdCol: AnyPgColumn;
}

const linkSources: AttachmentLinkSource[] = [];

// Create a `<owner>_attachments` join table linking a consumer's domain table
// to `_attachments`. Both FKs use ON DELETE CASCADE, so deleting an owner row
// drops the link row; the orphan sweep reclaims the attachment row when its
// last link disappears. Registration is a module-load side effect — returning
// the table from here and forgetting to register it would defeat the sweep.
export function defineLink<T extends OwnerTable>(ownerTable: T) {
  const name = `${getTableName(ownerTable)}_attachments`;
  const link = pgTable(
    name,
    {
      ownerId: text("owner_id")
        .notNull()
        .references((): AnyPgColumn => ownerTable.id, { onDelete: "cascade" }),
      attachmentId: text("attachment_id")
        .notNull()
        .references(() => _attachments.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [primaryKey({ columns: [t.ownerId, t.attachmentId] })],
  );
  linkSources.push({ table: link, attachmentIdCol: link.attachmentId });
  return link;
}

export function getRegisteredLinks(): readonly AttachmentLinkSource[] {
  return linkSources;
}
