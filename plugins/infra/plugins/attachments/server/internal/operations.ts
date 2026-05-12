import { eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { db } from "@plugins/database/server";
import { _attachments } from "./tables";
import type { Attachment } from "../../internal/types";

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
