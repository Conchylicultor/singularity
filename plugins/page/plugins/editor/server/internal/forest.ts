import { and, eq, inArray, isNull } from "drizzle-orm";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import { _blocks } from "./tables";
import { requireLiveParent, type BlockReadExecutor } from "./page-id";

export type BlockRow = typeof _blocks.$inferSelect;

/**
 * The destination sibling set of a REPARENT, plus the liveness guard on the
 * destination itself. Every write that moves a block under a caller-supplied
 * `parentId` must read this to mint a rank, which is what makes it the natural
 * chokepoint for the guard (see `requireLiveParent`): a future move-shaped
 * handler cannot position a block without going through it.
 *
 * Returns EVERY LIVE row under `parentId` — not scoped by `page_id`, not
 * filtered by `type`, but excluding trashed rows. `(parent_id, rank)` is ONE
 * ordering space shared by sub-page rows and content rows, and several live
 * resources project it disjointly, so arithmetic over a filtered projection
 * mints keys that collide with the siblings it cannot see. Trashed rows are
 * excluded for the opposite reason: the unique index is partial
 * (`WHERE deleted_at IS NULL`), so a trashed row may legitimately share a live
 * row's rank — including it would hand the rank math two siblings at one rank
 * and abort with `Rank.between(r, r)`.
 *
 * Call inside the write's own transaction so the window cannot go stale before
 * the writes land.
 */
export async function loadLiveSiblings(
  executor: BlockReadExecutor,
  parentId: string | null,
): Promise<BlockRow[]> {
  await requireLiveParent(parentId, executor);
  return executor
    .select()
    .from(_blocks)
    .where(
      parentId === null
        ? and(isNull(_blocks.parentId), isNull(_blocks.deletedAt))
        : and(eq(_blocks.parentId, parentId), isNull(_blocks.deletedAt)),
    );
}

/**
 * Load every LIVE content block of a page (raw rows, rank as the stored string).
 * Trashed rows are excluded: this feeds the op/patch reducers AND the rank-window
 * math, and the partial unique index only constrains live rows — so rank
 * arithmetic must run over exactly the live sibling set to stay consistent.
 */
export async function loadPageBlocks(
  pageId: string,
  executor: RankExecutor = db,
): Promise<BlockRow[]> {
  return executor
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.pageId, pageId), isNull(_blocks.deletedAt)));
}

/**
 * The multi-page generalization of {@link loadPageBlocks} — the read behind
 * `PageForestCtx.forest()`, so a write spanning several locked pages sees all of
 * them in one query. Same live-rows-only rule, same reason.
 */
export async function loadPagesBlocks(
  executor: RankExecutor,
  pageIds: string[],
): Promise<BlockRow[]> {
  if (pageIds.length === 0) return [];
  return executor
    .select()
    .from(_blocks)
    .where(and(inArray(_blocks.pageId, pageIds), isNull(_blocks.deletedAt)));
}
