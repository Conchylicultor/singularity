import { and, eq, isNull } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { db } from "@server/db/client";
import { _attachments } from "./tables";
import type { Attachment } from "../../shared/types";

export async function getAttachment(id: string): Promise<Attachment | null> {
  const [row] = await db.select().from(_attachments).where(eq(_attachments.id, id)).limit(1);
  return row ? toAttachment(row) : null;
}

/**
 * Link a staged attachment to an owner. Fails if the attachment is already
 * attached to a different owner (concurrent-submit protection).
 */
export async function attachAttachment(
  id: string,
  ownerType: string,
  ownerId: string,
): Promise<Attachment | null> {
  const [updated] = await db
    .update(_attachments)
    .set({ ownerType, ownerId })
    .where(and(eq(_attachments.id, id), isNull(_attachments.ownerId)))
    .returning();
  return updated ? toAttachment(updated) : null;
}

export async function listAttachmentsForOwner(
  ownerType: string,
  ownerId: string,
): Promise<Attachment[]> {
  const rows = await db
    .select()
    .from(_attachments)
    .where(and(eq(_attachments.ownerType, ownerType), eq(_attachments.ownerId, ownerId)));
  return rows.map(toAttachment);
}

/**
 * Cascade delete all attachments owned by (ownerType, ownerId). Intended for
 * consumers to call from their own delete paths (tasks / conversations / …).
 */
export async function deleteAttachmentsForOwner(
  ownerType: string,
  ownerId: string,
): Promise<number> {
  const rows = await db
    .delete(_attachments)
    .where(and(eq(_attachments.ownerType, ownerType), eq(_attachments.ownerId, ownerId)))
    .returning({ diskPath: _attachments.diskPath });
  await Promise.all(rows.map((r) => unlink(r.diskPath).catch(() => undefined)));
  return rows.length;
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const [row] = await db
    .delete(_attachments)
    .where(eq(_attachments.id, id))
    .returning({ diskPath: _attachments.diskPath });
  if (!row) return false;
  await unlink(row.diskPath).catch(() => undefined);
  return true;
}

function toAttachment(row: typeof _attachments.$inferSelect): Attachment {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    diskPath: row.diskPath,
    createdAt: row.createdAt.toISOString(),
  };
}
