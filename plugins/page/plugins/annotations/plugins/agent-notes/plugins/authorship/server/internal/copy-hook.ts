import { inArray } from "drizzle-orm";
import type { BlockCopyHook } from "@plugins/page/plugins/editor/server";
import { _pageBlocksAgentAuthors } from "./tables";

/**
 * A copied block keeps its provenance: every conversation that wrote the
 * source is recorded as an author of the copy. The record is a statement about
 * the CONTENT ("an agent wrote this"), and a copy is that same content — an
 * agent page pasted elsewhere still names the conversation that wrote it.
 */
export const copyAgentAuthorsHook: BlockCopyHook = {
  onCopy: async (blocks, tx) => {
    if (blocks.length === 0) return;
    const copiesOf = new Map<string, string[]>();
    for (const b of blocks) {
      const list = copiesOf.get(b.sourceId);
      if (list) list.push(b.copyId);
      else copiesOf.set(b.sourceId, [b.copyId]);
    }
    const authors = await tx
      .select({
        blockId: _pageBlocksAgentAuthors.blockId,
        conversationId: _pageBlocksAgentAuthors.conversationId,
        createdAt: _pageBlocksAgentAuthors.createdAt,
      })
      .from(_pageBlocksAgentAuthors)
      .where(inArray(_pageBlocksAgentAuthors.blockId, [...copiesOf.keys()]));
    const rows = authors.flatMap((a) =>
      (copiesOf.get(a.blockId) ?? []).map((copyId) => ({
        blockId: copyId,
        conversationId: a.conversationId,
        // Keep the original time: the popover orders authors by it, and the
        // first writer is still the first writer.
        createdAt: a.createdAt,
      })),
    );
    if (rows.length === 0) return;
    await tx.insert(_pageBlocksAgentAuthors).values(rows).onConflictDoNothing();
  },
};
