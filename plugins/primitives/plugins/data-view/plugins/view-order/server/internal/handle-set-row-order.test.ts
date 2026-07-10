/**
 * Real-DB suite for the full-replace row-order write. Drives the db-parametrized
 * `applyRowOrder` against a throwaway Postgres (db-test-fixture) with the REAL
 * migration chain applied — the `ON CONFLICT` upsert, the `NOT IN` delete, and
 * the `rank_text` (C-collation) ordering are exactly what production runs.
 *
 * Requires the running embedded cluster AND the `data_view_row_order` migration
 * (i.e. `./singularity build` first):
 *
 *   bun test plugins/primitives/plugins/data-view/plugins/view-order/server
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { and, asc, eq } from "drizzle-orm";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { _dataViewRowOrder } from "./tables";
import { applyRowOrder } from "./handle-set-row-order";

let t: TestDb;

const DATA_VIEW_ID = "test.surface";
const VIEW_ID = "view-1";

beforeAll(async () => {
  t = await createTestDb({ prefix: "dvro_test" });
  await runMigrations(t.db);
});

afterAll(async () => {
  await t.drop();
});

beforeEach(async () => {
  await t.db.delete(_dataViewRowOrder);
});

/** The persisted keys of one scope, rank-ascending — the displayed order. */
async function readOrder(viewId = VIEW_ID): Promise<string[]> {
  const rows = await t.db
    .select({ rowKey: _dataViewRowOrder.rowKey })
    .from(_dataViewRowOrder)
    .where(
      and(
        eq(_dataViewRowOrder.dataViewId, DATA_VIEW_ID),
        eq(_dataViewRowOrder.viewId, viewId),
      ),
    )
    .orderBy(asc(_dataViewRowOrder.rank));
  return rows.map((r) => r.rowKey);
}

function write(order: string[], viewId = VIEW_ID): Promise<void> {
  return applyRowOrder(t.db, { dataViewId: DATA_VIEW_ID, viewId, order });
}

describe("applyRowOrder", () => {
  test("persists the order dense and rank-ascending", async () => {
    await write(["A", "C", "B"]);
    expect(await readOrder()).toEqual(["A", "C", "B"]);
  });

  test("deletes rows absent from the new order (self-GC)", async () => {
    await write(["A", "B", "C"]);
    await write(["C", "A"]);
    expect(await readOrder()).toEqual(["C", "A"]);
  });

  test("an empty order drops the whole scope", async () => {
    await write(["A", "B"]);
    await write([]);
    expect(await readOrder()).toEqual([]);
  });

  test("re-ranks deterministically — an unchanged position keeps its rank", async () => {
    await write(["A", "B", "C"]);
    const before = await t.db
      .select({ rowKey: _dataViewRowOrder.rowKey, rank: _dataViewRowOrder.rank })
      .from(_dataViewRowOrder);
    const rankOf = new Map(before.map((r) => [r.rowKey, r.rank]));

    // Same length, C and B swap. `Rank.nBetween(null, null, 3)` is deterministic,
    // so position 0 ("A") keeps the exact rank it already had.
    await write(["A", "C", "B"]);
    const after = await t.db
      .select({ rowKey: _dataViewRowOrder.rowKey, rank: _dataViewRowOrder.rank })
      .from(_dataViewRowOrder);
    const nextRankOf = new Map(after.map((r) => [r.rowKey, r.rank]));

    expect(nextRankOf.get("A")).toBe(rankOf.get("A")!);
    expect(nextRankOf.get("C")).toBe(rankOf.get("B")!);
    expect(nextRankOf.get("B")).toBe(rankOf.get("C")!);
  });

  test("ranks sort by C collation, matching Rank.compare", async () => {
    await write(["A", "B", "C"]);
    const rows = await t.db
      .select({ rowKey: _dataViewRowOrder.rowKey, rank: _dataViewRowOrder.rank })
      .from(_dataViewRowOrder)
      .orderBy(asc(_dataViewRowOrder.rank));
    const inJs = [...rows]
      .sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)))
      .map((r) => r.rowKey);
    expect(rows.map((r) => r.rowKey)).toEqual(inJs);
  });

  test("rejects a duplicated rowKey", async () => {
    // Not `expect(...).rejects` — bun:test types that as non-thenable, which trips
    // `@typescript-eslint/await-thenable`. Catch the rejection explicitly instead.
    let caught: unknown;
    await write(["A", "B", "A"]).catch((err: unknown) => {
      caught = err;
    });
    expect(caught).toBeInstanceOf(HttpError);
    // The duplicate is rejected BEFORE the transaction opens, so nothing is written.
    expect(await readOrder()).toEqual([]);
  });

  test("scopes the replace to one view instance", async () => {
    await write(["A", "B"], "view-1");
    await write(["B", "A"], "view-2");
    // view-2's full replace must not touch view-1's rows.
    expect(await readOrder("view-1")).toEqual(["A", "B"]);
    expect(await readOrder("view-2")).toEqual(["B", "A"]);
  });
});
