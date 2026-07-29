import { and, inArray, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineRetention } from "@plugins/infra/plugins/retention/server";
import { _blocks, deleteBlocksSubtree } from "@plugins/page/plugins/editor/server";
import { _pageBlocksOriginExt } from "./tables";

// 24h: comfortably longer than the "open the page and see why the assertion
// failed" window that made per-script teardown unnecessary, short enough that a
// control run against main is harmless by the next morning.
const AGENT_PAGE_TTL_DAYS = 1;

/**
 * The nightly sweep. The retention primitive's own DELETE is hardcoded to
 * `spec.table`, so the MARKER is the sweep target and the pages themselves are
 * removed by `beforeDelete` — exactly how the trash plugin drives
 * `purgeTrashedPages` (`infra/trash/server/internal/purge.ts`).
 *
 * `deleteBlocksSubtree` is THE delete chokepoint: a page root in the cascade set
 * always takes the TRASH path (soft delete + a `trash_entries` row), so the
 * lifecycle hooks fire and search-index / history / link state is dropped
 * correctly. Swept pages therefore land in trash — recoverable, hard-deleted
 * later by trash's own 30-day purge. Given the marker is inferred from a
 * request header, that margin is worth having.
 *
 * The marker row is deleted by the retention DELETE in the same tick, which
 * makes the sweep naturally idempotent (a trashed page is never re-swept).
 *
 * `perWorktree` because `page_blocks` (and its extensions) live in the
 * per-worktree DB fork — each fork sweeps its own marked pages.
 */
export const agentPagesSweep = defineRetention({
  table: _pageBlocksOriginExt,
  column: "createdAt",
  ttlDays: AGENT_PAGE_TTL_DAYS,
  perWorktree: true,
  beforeDelete: async (rows) => {
    const parentIds = rows.map((row) => String(row.parentId));
    if (parentIds.length === 0) return;
    // Only pages that are still LIVE get trashed. A row whose page is already
    // gone (hard-deleted) or already trashed (`deleted_at IS NOT NULL`) is
    // skipped, so a user-deleted agent page doesn't mint a second trash entry —
    // the same pre-filter the trash purge applies. Its marker still expires in
    // the DELETE below.
    const live = await db
      .select({ id: _blocks.id })
      .from(_blocks)
      .where(and(inArray(_blocks.id, parentIds), isNull(_blocks.deletedAt)));
    // One call per page so each gets its own independently-restorable
    // `trash_entries` row, rather than folding a night's worth of unrelated
    // agent pages into a single all-or-nothing restore.
    for (const row of live) await deleteBlocksSubtree([row.id]);
  },
});
