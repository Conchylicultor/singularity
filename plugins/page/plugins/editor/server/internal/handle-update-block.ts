import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { liveBlocks } from "./live-blocks";
import { withPageForest } from "./page-forest";
import { updateBlockFields, type BlockColumnChanges } from "./forest-writer";
import { notifyBlockChange } from "./notify";
import { parseBlockData } from "./parse-block-data";

export const handleUpdateBlock = implement(
  updateBlock,
  async ({ params, body }) => {
    // The row's page scope names the forest to lock; its `type` is what `data`
    // must be validated against (`body.type ?? row.type`), not blindly persisted.
    // A trashed row is not addressable (404, like an unknown id) — writing onto
    // it would edit content the user cannot see.
    const [existing] = await db
      .select({ type: liveBlocks.type, pageId: liveBlocks.pageId })
      .from(liveBlocks)
      .where(eq(liveBlocks.id, params.id))
      .limit(1);
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

    const { value: updated } = await withPageForest(
      existing.pageId,
      async (ctx) => {
        // Re-read the type under the lock: a concurrent conversion between the scope
        // read above and this write would otherwise have `data` validated against a
        // type the row no longer holds — and a concurrent delete would have
        // trashed it, which is the same 404.
        const [row] = await ctx.tx
          .select({ type: liveBlocks.type })
          .from(liveBlocks)
          .where(eq(liveBlocks.id, params.id))
          .limit(1);
        if (!row) throw new HttpError(404, "Not found");

        const patch: BlockColumnChanges = { updatedAt: new Date() };
        if (typeof body.type === "string") patch.type = body.type;
        if (body.data !== undefined) {
          patch.data = parseBlockData(body.type ?? row.type, body.data);
        }
        if (typeof body.expanded === "boolean") patch.expanded = body.expanded;
        await updateBlockFields(ctx.tx, params.id, patch);

        const [after] = await ctx.tx
          .select({
            id: liveBlocks.id,
            pageId: liveBlocks.pageId,
            type: liveBlocks.type,
          })
          .from(liveBlocks)
          .where(eq(liveBlocks.id, params.id))
          .limit(1);
        if (!after) throw new HttpError(404, "Not found");
        return after;
      },
    );

    await notifyBlockChange({
      pageId: updated.pageId,
      type: updated.type,
      blockId: updated.id,
    });
    const [row] = await db
      .select()
      .from(liveBlocks)
      .where(eq(liveBlocks.id, params.id))
      .limit(1);
    if (!row) throw new HttpError(404, "Not found after update");
    return BlockSchema.parse(row);
  },
);
