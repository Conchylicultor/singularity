import { inArray } from "drizzle-orm";
import type { BlockCopyHook } from "@plugins/page/plugins/editor/server";
import { _pageBlockDocs } from "./tables";

/**
 * A copied block takes its source's content doc, byte for byte.
 *
 * The doc is the text's one owner and the row's `data.text` only trails it by
 * ~1 s, so a copy seeded from the row alone could miss the last edits. A doc's
 * bytes are not tied to the block id they are stored under, so the copy is an
 * independent doc holding exactly the source's content — and an editor opening
 * the copy binds to it like any stored doc.
 */
export const copyBlockDocsHook: BlockCopyHook = {
  onCopy: async (blocks, tx) => {
    if (blocks.length === 0) return;
    const copiesOf = new Map<string, string[]>();
    for (const b of blocks) {
      const list = copiesOf.get(b.sourceId);
      if (list) list.push(b.copyId);
      else copiesOf.set(b.sourceId, [b.copyId]);
    }
    const docs = await tx
      .select({ blockId: _pageBlockDocs.blockId, state: _pageBlockDocs.state })
      .from(_pageBlockDocs)
      .where(inArray(_pageBlockDocs.blockId, [...copiesOf.keys()]));
    const rows = docs.flatMap((d) =>
      (copiesOf.get(d.blockId) ?? []).map((copyId) => ({
        blockId: copyId,
        state: d.state,
      })),
    );
    if (rows.length === 0) return;
    await tx.insert(_pageBlockDocs).values(rows);
  },
};
