import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { setRowOrder, type SetRowOrderBody } from "../../core";
import { _dataViewRowOrder } from "./tables";

/**
 * The drizzle handle this module writes through — `db`, or a throwaway test
 * database. Narrowed to the ONE capability used (`transaction`) rather than the
 * whole `typeof db`: the `db-test-fixture` handle carries no `$client`, and a
 * parameter should demand what it needs, not what the production value happens
 * to have.
 */
type RowOrderDb = Pick<typeof db, "transaction">;

/**
 * Replace a view instance's entire manual row order, in ONE transaction:
 *
 * 1. Reject a duplicated `rowKey` — a client bug, never an absorbable value.
 * 2. Delete every `(dataViewId, viewId)` row absent from `order`. This is the
 *    self-GC: rows the view's filter dropped, and rows that no longer exist,
 *    leave the table on the next reorder.
 * 3. Upsert dense ranks for `order`, in position order.
 *
 * `Rank.nBetween(null, null, k)` is **deterministic**: the k-th rank of a
 * k-element order is always the same key. So an upsert only *changes* the rows
 * whose position actually moved — the rows between the drag's source and
 * destination — and the DB change-feed's diff stays proportional to the move, not
 * to the list. Do not swap this for a delete-then-reinsert-everything write: it
 * would rewrite every rank and push a full-list diff on every drag.
 */
export async function applyRowOrder(
  database: RowOrderDb,
  { dataViewId, viewId, order }: SetRowOrderBody,
): Promise<void> {
  if (new Set(order).size !== order.length) {
    throw new HttpError(400, "setRowOrder: `order` contains duplicate rowKeys");
  }

  await database.transaction(async (tx) => {
    const scope = and(
      eq(_dataViewRowOrder.dataViewId, dataViewId),
      eq(_dataViewRowOrder.viewId, viewId),
    );

    if (order.length === 0) {
      // An empty ordered set means the view has no orderable rows left; drop the
      // whole scope. (`notInArray(col, [])` is not a valid predicate.)
      await tx.delete(_dataViewRowOrder).where(scope);
      return;
    }

    await tx
      .delete(_dataViewRowOrder)
      .where(and(scope, notInArray(_dataViewRowOrder.rowKey, order)));

    // `nBetween(null, null, n)` returns exactly `n` ranks, so the index is total.
    const ranks = Rank.nBetween(null, null, order.length);
    await tx
      .insert(_dataViewRowOrder)
      .values(
        order.map((rowKey, i) => ({
          dataViewId,
          viewId,
          rowKey,
          rank: ranks[i]!.toString(),
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
        // Skip the UPDATE entirely for a row whose rank is unchanged, so a drag
        // touches only the rows between its source and destination. Without this
        // the deterministic ranks would still be correct, but every row in the
        // ordered set would be rewritten (and its `updated_at` bumped) on every
        // drag.
        setWhere: sql`${_dataViewRowOrder.rank} IS DISTINCT FROM excluded.rank`,
      });
  });
}

export const handleSetRowOrder = implement(setRowOrder, ({ body }) =>
  applyRowOrder(db, body),
);
