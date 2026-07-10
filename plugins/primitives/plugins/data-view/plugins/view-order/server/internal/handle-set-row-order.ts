import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { setRowOrder, type SetRowOrderBody } from "../../core";
import { _dataViewRowOrder } from "./tables";

/**
 * The drizzle handle this module writes through — `db`, or a throwaway test
 * database. Narrowed to the ONE capability used (`insert`) rather than the whole
 * `typeof db`: the write is now a single upsert (no transaction), and the
 * `db-test-fixture` handle carries no `$client`, so a parameter should demand
 * what it needs, not what the production value happens to have.
 */
type RowOrderDb = Pick<typeof db, "insert">;

/**
 * Upsert a view instance's **bounded** row-order write set — one statement, no
 * transaction, no `DELETE`. This is the whole point of the bounded rule: a drag
 * writes only the moved row plus the seeds materialized ahead of it (see
 * `computeMoveWrites`), so the write cost is `O(gesture)`, not `O(view)`, and a
 * row absent from `writes` keeps its persisted rank — **nothing is deleted**.
 *
 * Two client bugs are rejected up front (an `HttpError`, never an absorbable
 * value), before any write:
 *
 * 1. A duplicated `rowKey` — the same PK twice in one upsert is a client bug.
 * 2. A `rank` sequence that is not strictly ascending — the client mints ranks
 *    rank-ascending; a violated ordering means the client's rank arithmetic is
 *    broken, and persisting it would silently corrupt the display order.
 *
 * The `setWhere` keeps the change-feed diff minimal: a re-POST of an unchanged
 * rank pushes no change (`IS DISTINCT FROM` short-circuits the UPDATE).
 */
export async function applyRowOrder(
  database: RowOrderDb,
  { dataViewId, viewId, writes }: SetRowOrderBody,
): Promise<void> {
  if (new Set(writes.map((w) => w.rowKey)).size !== writes.length) {
    throw new HttpError(400, "setRowOrder: `writes` contains duplicate rowKeys");
  }
  for (let i = 1; i < writes.length; i++) {
    if (Rank.compare(writes[i - 1]!.rank, writes[i]!.rank) >= 0) {
      throw new HttpError(
        400,
        "setRowOrder: `writes` ranks are not strictly ascending",
      );
    }
  }

  await database
    .insert(_dataViewRowOrder)
    .values(
      writes.map((w) => ({
        dataViewId,
        viewId,
        rowKey: w.rowKey,
        rank: w.rank.toString(),
      })),
    )
    .onConflictDoUpdate({
      target: [
        _dataViewRowOrder.dataViewId,
        _dataViewRowOrder.viewId,
        _dataViewRowOrder.rowKey,
      ],
      set: {
        rank: sql`excluded.rank`,
        updatedAt: new Date(),
      },
      // Skip the UPDATE for a row whose rank is unchanged, so a re-POST of an
      // already-persisted rank pushes no change-feed diff.
      setWhere: sql`${_dataViewRowOrder.rank} IS DISTINCT FROM excluded.rank`,
    });
}

export const handleSetRowOrder = implement(setRowOrder, ({ body }) =>
  applyRowOrder(db, body),
);
