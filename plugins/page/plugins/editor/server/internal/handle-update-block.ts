import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { notifyBlockChange } from "./notify";

export const handleUpdateBlock = implement(updateBlock, async ({ params, body }) => {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.type === "string") patch.type = body.type;
  if (body.data !== undefined) patch.data = body.data;
  if (typeof body.expanded === "boolean") patch.expanded = body.expanded;
  const [updated] = await db
    .update(_blocks)
    .set(patch)
    .where(eq(_blocks.id, params.id))
    .returning({ id: _blocks.id, pageId: _blocks.pageId, type: _blocks.type });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!updated) throw new HttpError(404, "Not found");
  await notifyBlockChange({ pageId: updated.pageId, type: updated.type, blockId: updated.id });
  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found after update");
  return BlockSchema.parse(row);
});
