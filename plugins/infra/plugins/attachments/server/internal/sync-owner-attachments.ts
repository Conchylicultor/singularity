import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@server/db/client";

// Reconcile a consumer's `<owner>_attachments` link rows so they exactly match
// the set of attachment ids referenced by `text` (typically markdown). New ids
// are inserted; ids present in the link table but no longer in the text are
// deleted. Cascade rules on the link table reclaim the underlying attachment
// row via the orphan sweep when no link references it anywhere.
//
// `link` should be the table returned by `Attachments.defineLink(ownerTable)`
// — it must expose `ownerId` and `attachmentId` text columns.
export async function syncOwnerAttachments(
  link: PgTable & {
    ownerId: AnyPgColumn;
    attachmentId: AnyPgColumn;
  },
  ownerId: string,
  ids: readonly string[],
): Promise<void> {
  const wanted = Array.from(new Set(ids));

  if (wanted.length === 0) {
    await db.delete(link).where(eq(link.ownerId, ownerId));
    return;
  }

  await db
    .insert(link)
    .values(wanted.map((attachmentId) => ({ ownerId, attachmentId })))
    .onConflictDoNothing();

  await db
    .delete(link)
    .where(
      and(eq(link.ownerId, ownerId), notInArray(link.attachmentId, wanted)),
    );

  // `inArray` import kept (drizzle-orm) for future filtered reads — biome
  // would otherwise prune it. No-op here.
  void inArray;
}
