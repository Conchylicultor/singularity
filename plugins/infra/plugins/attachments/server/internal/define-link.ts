import { and, eq, getTableName, notInArray } from "drizzle-orm";
import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
  type PgTable,
} from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import type { Attachment } from "../../internal/types";
import { _attachments } from "./tables";

type OwnerTable = PgTable & { id: AnyPgColumn };

type LinkTable = PgTable & {
  ownerId: AnyPgColumn;
  attachmentId: AnyPgColumn;
};

export interface AttachmentLinkSource {
  table: PgTable;
  attachmentIdCol: AnyPgColumn;
}

// Typed handle returned by `Attachments.defineLink(ownerTable)`. Wraps the
// underlying join table with a fixed protocol (`set`/`add`/`list`); the table
// itself is exposed as `.table` for intra-plugin raw queries (drizzle-kit
// schema discovery + niche selects). Cross-plugin imports of the underlying
// table are blocked by the plugin-boundary checker because the table never
// leaves `internal/` — only the handle is barrel-exported.
export interface AttachmentLink {
  readonly table: LinkTable;
  // Reconcile link rows so they exactly match `ids`. Inserts new ids,
  // deletes ids no longer present. Use when the attachment set is the
  // canonical mirror of a replaceable source (e.g. a markdown column).
  set(ownerId: string, ids: readonly string[]): Promise<void>;
  // Append-only union. Atomic: one INSERT … ON CONFLICT DO NOTHING. Use
  // when the source of truth grows append-only (turns in a conversation,
  // attachments inherited by chained tasks). Avoids the read-merge-write
  // race that `set(union(existing, new))` would have.
  add(ownerId: string, ids: readonly string[]): Promise<void>;
  // List attachments linked to the given owner, joined with `_attachments`.
  list(ownerId: string): Promise<Attachment[]>;
}

const linkSources: AttachmentLinkSource[] = [];

// Create a `<owner>_attachments` join table linking a consumer's domain table
// to `_attachments`, and return a handle whose methods close over it. Both
// FKs cascade on owner/attachment delete; the orphan sweep reclaims rows
// whose last link disappears. Module-load side effect — every consumer's
// `tables*.ts` / `schema*.ts` runs at import time, registering its link.
export function defineLink<T extends OwnerTable>(ownerTable: T): AttachmentLink {
  const name = `${getTableName(ownerTable)}_attachments`;
  const table = pgTable(
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
  linkSources.push({ table, attachmentIdCol: table.attachmentId });

  return Object.freeze({
    table,
    async set(ownerId, ids) {
      const wanted = Array.from(new Set(ids));
      await db.transaction(async (tx) => {
        if (wanted.length === 0) {
          await tx.delete(table).where(eq(table.ownerId, ownerId));
          return;
        }
        await tx
          .insert(table)
          .values(wanted.map((attachmentId) => ({ ownerId, attachmentId })))
          .onConflictDoNothing();
        await tx
          .delete(table)
          .where(
            and(eq(table.ownerId, ownerId), notInArray(table.attachmentId, wanted)),
          );
      });
    },
    async add(ownerId, ids) {
      const wanted = Array.from(new Set(ids));
      if (wanted.length === 0) return;
      await db
        .insert(table)
        .values(wanted.map((attachmentId) => ({ ownerId, attachmentId })))
        .onConflictDoNothing();
    },
    async list(ownerId) {
      const rows = await db
        .select({
          id: _attachments.id,
          filename: _attachments.filename,
          mime: _attachments.mime,
          size: _attachments.size,
          diskPath: _attachments.diskPath,
          createdAt: _attachments.createdAt,
        })
        .from(table)
        .innerJoin(_attachments, eq(_attachments.id, table.attachmentId))
        .where(eq(table.ownerId, ownerId));
      return rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        mime: r.mime,
        size: r.size,
        diskPath: r.diskPath,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  } satisfies AttachmentLink);
}

export function getRegisteredLinks(): readonly AttachmentLinkSource[] {
  return linkSources;
}
