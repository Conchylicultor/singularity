import { eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { db } from "@plugins/database/server";
import { _attachments } from "./tables";
import { diskPathFor, ensureAttachmentsRoot } from "./paths";
import type { Attachment } from "../../shared/types";

// Mint an attachment from raw bytes (server-side seeding, no HTTP round-trip).
// Writes the file to disk and inserts an unlinked `_attachments` row; callers
// link the returned id from their own submit path (see `Attachments.defineLink`).
export async function createAttachment(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): Promise<Attachment> {
  await ensureAttachmentsRoot();
  const id = crypto.randomUUID();
  const diskPath = diskPathFor(id, filename);
  await Bun.write(diskPath, bytes);

  const [row] = await db
    .insert(_attachments)
    .values({
      id,
      filename,
      mime,
      size: bytes.byteLength,
      diskPath,
    })
    .returning();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new Error("failed to record attachment");
  return toAttachment(row);
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  const [row] = await db.select().from(_attachments).where(eq(_attachments.id, id)).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row ? toAttachment(row) : null;
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const [row] = await db
    .delete(_attachments)
    .where(eq(_attachments.id, id))
    .returning({ diskPath: _attachments.diskPath });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return false;
  await unlink(row.diskPath).catch(() => undefined);
  return true;
}

function toAttachment(row: typeof _attachments.$inferSelect): Attachment {
  return {
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    diskPath: row.diskPath,
    createdAt: row.createdAt.toISOString(),
  };
}
