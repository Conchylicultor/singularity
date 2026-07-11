import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import type { BlockData } from "../../core/schemas";
import { _blocks } from "./tables";
import { notifyBlockChange } from "./notify";
import { parseBlockData } from "./parse-block-data";

export const handleUpdateBlock = implement(updateBlock, async ({ params, body }) => {
  // Read the row's current type first: `data` must be validated against the type it
  // will end up under (`body.type ?? row.type`), not blindly persisted.
  const [existing] = await db
    .select({ type: _blocks.type })
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!existing) throw new HttpError(404, "Not found");

  // A `type` change without a new `data` would strand the old type's payload under
  // the new type — always malformed against the new schema. Reject loudly rather
  // than persist an invalid row. (A `type`-less, `data`-less update — e.g. toggling
  // `expanded` — is valid and skips validation entirely.)
  if (typeof body.type === "string" && body.data === undefined) {
    throw new HttpError(
      400,
      `Changing block type to "${body.type}" requires a matching \`data\` payload.`,
    );
  }

  const patch: {
    updatedAt: Date;
    type?: string;
    data?: BlockData;
    expanded?: boolean;
  } = { updatedAt: new Date() };
  if (typeof body.type === "string") patch.type = body.type;
  if (body.data !== undefined) {
    patch.data = parseBlockData(body.type ?? existing.type, body.data);
  }
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
