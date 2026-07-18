import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { sql } from "drizzle-orm";
import {
  LIVE_STATE_CHANGELOG_TABLE,
  LIVE_STATE_SNAPSHOT_TABLE,
} from "@plugins/database/plugins/derived-views/core";
import { ensureChangelogTable } from "@plugins/database/plugins/change-feed/server";
import type { DbChange } from "@plugins/database/plugins/change-feed/server";
import { ensureSnapshotTable } from "./tables-ddl";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { persistSnapshot } from "./persist";
import { runCatchUp } from "./catch-up";

// Real-DB invariant suite for the cold-boot catch-up driver: the xid-vs-floor
// arithmetic, the `xid >= floor` + `ORDER BY seq` replay predicate, the DELETE /
// null-ids FULL degrade, and the missing-history backstop. A recording `route`
// spy is injected so we observe EXACTLY which changes replay (order, op, ids),
// without standing up the full server-core cascade. Runs the real SQL against a
// throwaway database on the running cluster (see the db-test-fixture primitive).

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ prefix: "lss_test" });
  await ensureSnapshotTable(t.db);
  await ensureChangelogTable(t.db);
});

afterAll(async () => {
  await t.drop();
});

beforeEach(async () => {
  await t.db.execute(sql.raw(`DELETE FROM ${LIVE_STATE_SNAPSHOT_TABLE}`));
  await t.db.execute(sql.raw(`DELETE FROM ${LIVE_STATE_CHANGELOG_TABLE}`));
});

// Seed a snapshot row so `min(position)` yields the catch-up floor.
async function seedFloor(position: string): Promise<void> {
  await persistSnapshot(t.db, `floor-${position}`, "{}", {}, position, ["seed"]);
}

interface ChangelogSeed {
  seq: number;
  xid: string;
  t: string;
  op: "I" | "U" | "D";
  ids: string[] | null;
}

async function insertChangelog(row: ChangelogSeed): Promise<void> {
  const idsExpr =
    row.ids === null
      ? sql`NULL`
      : sql`ARRAY[${sql.join(
          row.ids.map((i) => sql`${i}`),
          sql`, `,
        )}]::text[]`;
  await t.db.execute(sql`
    INSERT INTO ${sql.raw(LIVE_STATE_CHANGELOG_TABLE)} (seq, xid, t, op, ids)
    VALUES (${row.seq}, ${row.xid}::numeric, ${row.t}, ${row.op}, ${idsExpr})
  `);
}

function recorder(): { routed: DbChange[]; route: (c: DbChange) => void } {
  const routed: DbChange[] = [];
  return {
    routed,
    route: (c) => {
      routed.push(c);
    },
  };
}

describe("runCatchUp", () => {
  test("no snapshots → early return, zero replays even with changelog rows", async () => {
    await insertChangelog({ seq: 1, xid: "100", t: "ta", op: "U", ids: null });
    const { routed, route } = recorder();
    await runCatchUp(t.db, route);
    expect(routed).toEqual([]);
  });

  test("normal replay: only xid >= floor, in seq order, correct {table,op,ids}", async () => {
    await seedFloor("200");
    // Straddle the floor. min(xid)=100 < floor so NOT the backstop path.
    await insertChangelog({ seq: 1, xid: "100", t: "ta", op: "U", ids: ["1"] }); // excluded (< floor)
    await insertChangelog({ seq: 2, xid: "200", t: "tb", op: "I", ids: ["2"] }); // included (== floor)
    await insertChangelog({ seq: 3, xid: "300", t: "tc", op: "D", ids: ["3"] }); // included, DELETE → ids null
    await insertChangelog({ seq: 4, xid: "400", t: "td", op: "U", ids: null }); // included, null-ids

    const { routed, route } = recorder();
    await runCatchUp(t.db, route);

    expect(routed).toEqual([
      { table: "tb", op: "I", ids: ["2"], xid: null },
      { table: "tc", op: "D", ids: null, xid: null }, // DELETE forced FULL (ids null)
      { table: "td", op: "U", ids: null, xid: null },
    ]);
  });

  test("boundary: xid == floor replayed, xid == floor-1 not", async () => {
    await seedFloor("200");
    await insertChangelog({ seq: 1, xid: "199", t: "below", op: "U", ids: null });
    await insertChangelog({ seq: 2, xid: "200", t: "at", op: "U", ids: null });

    const { routed, route } = recorder();
    await runCatchUp(t.db, route);

    expect(routed).toEqual([{ table: "at", op: "U", ids: null, xid: null }]);
  });

  test("backstop: min(xid) > floor → one FULL per DISTINCT table, no per-row replay", async () => {
    await seedFloor("100");
    // Oldest retained xid (200) > floor (100): history pruned past a stale
    // snapshot. Multiple rows across two distinct tables — assert distinct-table
    // FULL, not per-row replay.
    await insertChangelog({ seq: 1, xid: "200", t: "t1", op: "I", ids: ["a"] });
    await insertChangelog({ seq: 2, xid: "300", t: "t1", op: "U", ids: ["b"] });
    await insertChangelog({ seq: 3, xid: "400", t: "t2", op: "D", ids: ["c"] });

    const { routed, route } = recorder();
    await runCatchUp(t.db, route);

    // Exactly one FULL (op:'U', ids:null) per distinct table — order of
    // SELECT DISTINCT is not guaranteed, so compare as a set.
    expect(routed).toHaveLength(2);
    const bySet = new Set(routed.map((c) => `${c.table}:${c.op}:${c.ids}`));
    expect(bySet).toEqual(new Set(["t1:U:null", "t2:U:null"]));
  });

  test("empty changelog since floor → already current, zero replays", async () => {
    await seedFloor("200");
    // All rows already incorporated (xid < floor). min(xid)=100 < floor so NOT
    // backstop; the `xid >= floor` select is empty → early 'already current'.
    await insertChangelog({ seq: 1, xid: "100", t: "ta", op: "U", ids: null });
    await insertChangelog({ seq: 2, xid: "150", t: "tb", op: "U", ids: null });

    const { routed, route } = recorder();
    await runCatchUp(t.db, route);

    expect(routed).toEqual([]);
  });
});
