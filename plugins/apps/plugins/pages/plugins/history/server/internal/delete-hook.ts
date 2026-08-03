import { PAGE_BLOCK_TYPE, type BlockDeleteHook } from "@plugins/page/plugins/editor/server";
import { deleteVersions } from "@plugins/history/plugins/engine/server";

// Deleting a page (a `type="page"` block) FK-cascade-wipes its content blocks
// without surfacing the page itself, leaving orphaned version rows. The hook is
// handed the ROWS the write is removing, so "which of these are pages" is a
// `type` check in memory rather than a SELECT — then drop their version history
// AFTER the rows are gone, via the after-commit callback (a version wipe must
// not hold the page lock). Mirrors the search consumer's delete hook; decision:
// drop history on page delete (no orphans).
export const deletePageHistoryHook: BlockDeleteHook = {
  onDelete: (rows) => {
    const pageIds = rows
      .filter((r) => r.type === PAGE_BLOCK_TYPE)
      .map((r) => r.id);
    if (pageIds.length === 0) return;
    return async () => {
      await deleteVersions("pages", pageIds);
    };
  },
};
