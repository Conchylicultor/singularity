import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { sql } from "drizzle-orm";
import { LIVE_STATE_SNAPSHOT_TABLE } from "@plugins/database/plugins/derived-views/core";
import { ensureSnapshotTable } from "./tables-ddl";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import {
  captureWatermark,
  persistSnapshot,
  readPersistedReadSets,
  readPersistedSnapshots,
  clearPersistedSnapshots,
  reconcileReadSetTable,
} from "./persist";
import {
  onReadSetShrink,
  type ReadSetShrinkEvent,
} from "./read-set-shrink-hook";

// Real-DB invariant suite for the L2 persist SQL: xid8 watermark monotonicity,
// the ON CONFLICT upsert, the text[] `tables_read` round-trip (incl. the empty
// `ARRAY[]::text[]` path), jsonb value round-trip, and the `params_key='{}'`
// filtering of the read helpers. Runs the real SQL against a throwaway database on
// the running cluster (see the db-test-fixture primitive).

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ prefix: "lss_test" });
  await ensureSnapshotTable(t.db);
});

afterAll(async () => {
  await t.drop();
});

// Independent tests — clear the snapshot table between each.
beforeEach(async () => {
  await t.db.execute(sql.raw(`DELETE FROM ${LIVE_STATE_SNAPSHOT_TABLE}`));
});

async function countRows(): Promise<number> {
  const res = await t.db.execute<{ n: number }>(
    sql.raw(`SELECT count(*)::int AS n FROM ${LIVE_STATE_SNAPSHOT_TABLE}`),
  );
  return res.rows[0]?.n ?? 0;
}

async function selectRow(
  key: string,
  paramsKey: string,
): Promise<
  | { value: unknown; position: string; tables_read: string[] }
  | undefined
> {
  const res = await t.db.execute<{
    value: unknown;
    position: string;
    tables_read: string[];
  }>(
    sql`
      SELECT value, position::text AS position, tables_read
      FROM ${sql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE resource_key = ${key} AND params_key = ${paramsKey}
    `,
  );
  return res.rows[0];
}

describe("captureWatermark", () => {
  test("returns a non-empty numeric string", async () => {
    const wm = await captureWatermark(t.db);
    expect(typeof wm).toBe("string");
    expect(wm.length).toBeGreaterThan(0);
    // Parseable as a non-negative BigInt (xid8 stored as numeric).
    expect(BigInt(wm) >= 0n).toBe(true);
  });

  test("is monotonic non-decreasing across a committed write", async () => {
    const first = await captureWatermark(t.db);
    // Force xid advancement with a real committed write between captures.
    await persistSnapshot(t.db, "wm-probe", "{}", { n: 1 }, "1", ["t"]);
    await t.db.execute(
      sql`UPDATE ${sql.raw(LIVE_STATE_SNAPSHOT_TABLE)} SET updated_at = now() WHERE resource_key = ${"wm-probe"}`,
    );
    const second = await captureWatermark(t.db);
    expect(BigInt(second) >= BigInt(first)).toBe(true);
  });
});

describe("persistSnapshot", () => {
  test("inserts a row that reads back", async () => {
    await persistSnapshot(t.db, "k1", "{}", { hello: "world" }, "42", ["ta", "tb"]);
    const row = await selectRow("k1", "{}");
    expect(row).toBeDefined();
    expect(row!.value).toEqual({ hello: "world" });
    expect(row!.position).toBe("42");
    expect(row!.tables_read).toEqual(["ta", "tb"]);
  });

  test("second call on same (resource_key, params_key) UPDATES in place", async () => {
    await persistSnapshot(t.db, "k1", "{}", { v: 1 }, "10", ["ta"]);
    await persistSnapshot(t.db, "k1", "{}", { v: 2 }, "20", ["tb", "tc"]);
    expect(await countRows()).toBe(1);
    const row = await selectRow("k1", "{}");
    expect(row!.value).toEqual({ v: 2 });
    expect(row!.position).toBe("20");
    expect(row!.tables_read).toEqual(["tb", "tc"]);
  });

  test("tables_read round-trips: multi-element and empty array", async () => {
    await persistSnapshot(t.db, "multi", "{}", {}, "1", ["a", "b", "c"]);
    expect((await selectRow("multi", "{}"))!.tables_read).toEqual(["a", "b", "c"]);

    // The `ARRAY[]::text[]` path — an empty array must persist and read back [].
    await persistSnapshot(t.db, "empty", "{}", {}, "1", []);
    expect((await selectRow("empty", "{}"))!.tables_read).toEqual([]);
  });

  test("value jsonb round-trips nested object and array", async () => {
    const nested = { a: { b: [1, 2, { c: "d" }] }, e: null };
    await persistSnapshot(t.db, "obj", "{}", nested, "1", []);
    expect((await selectRow("obj", "{}"))!.value).toEqual(nested);

    const arr = [1, "two", { three: 3 }, [4]];
    await persistSnapshot(t.db, "arr", "{}", arr, "1", []);
    expect((await selectRow("arr", "{}"))!.value).toEqual(arr);
  });
});

describe("readPersistedReadSets", () => {
  test("returns only params_key='{}' rows; empty tables_read → []; excludes non-{} params", async () => {
    await persistSnapshot(t.db, "a", "{}", {}, "1", ["ta", "tb"]);
    await persistSnapshot(t.db, "b", "{}", {}, "1", []);
    // A non-{} params_key row must be EXCLUDED.
    await persistSnapshot(t.db, "c", '{"x":1}', {}, "1", ["tc"]);

    const map = await readPersistedReadSets(t.db);
    expect(map.get("a")).toEqual(["ta", "tb"]);
    expect(map.get("b")).toEqual([]);
    expect(map.has("c")).toBe(false);
    expect(map.size).toBe(2);
  });
});

describe("readPersistedSnapshots", () => {
  test("empty keys → empty Map, no query", async () => {
    const map = await readPersistedSnapshots(t.db, []);
    expect(map).toEqual(new Map());
    expect(map.size).toBe(0);
  });

  test("filters by IN; only {} rows; missing key absent; value round-trips", async () => {
    await persistSnapshot(t.db, "a", "{}", { v: "a" }, "1", []);
    await persistSnapshot(t.db, "b", "{}", { v: "b" }, "1", []);
    // Non-{} params_key must not be returned even if its key is requested.
    await persistSnapshot(t.db, "c", '{"p":1}', { v: "c" }, "1", []);

    const map = await readPersistedSnapshots(t.db, ["a", "c", "missing"]);
    expect(map.get("a")).toEqual({ v: "a" });
    expect(map.has("c")).toBe(false); // non-{} excluded
    expect(map.has("missing")).toBe(false); // absent
    expect(map.has("b")).toBe(false); // not requested
    expect(map.size).toBe(1);
  });
});

describe("clearPersistedSnapshots", () => {
  test("deletes only listed {} keys, returns exact count, leaves others intact", async () => {
    await persistSnapshot(t.db, "a", "{}", {}, "1", []);
    await persistSnapshot(t.db, "b", "{}", {}, "1", []);
    await persistSnapshot(t.db, "keep", "{}", {}, "1", []);
    // A non-{} row for a listed key must NOT be deleted (scoped to '{}').
    await persistSnapshot(t.db, "a", '{"p":1}', {}, "1", []);

    const deleted = await clearPersistedSnapshots(t.db, ["a", "b", "missing"]);
    expect(deleted).toBe(2); // 'a' {} and 'b' {} — 'missing' matches nothing

    expect(await selectRow("a", "{}")).toBeUndefined();
    expect(await selectRow("b", "{}")).toBeUndefined();
    expect(await selectRow("keep", "{}")).toBeDefined(); // unlisted {} intact
    expect(await selectRow("a", '{"p":1}')).toBeDefined(); // non-{} intact
  });

  test("empty keys → returns 0, no delete", async () => {
    await persistSnapshot(t.db, "a", "{}", {}, "1", []);
    const deleted = await clearPersistedSnapshots(t.db, []);
    expect(deleted).toBe(0);
    expect(await countRows()).toBe(1);
  });
});

describe("read-set shrink detection", () => {
  // Capture emitted shrink events via the seam. The handler is process-global
  // (last-writer-wins), so we install a spy for this block and restore a no-op at
  // the end. `captured` is reset between assertions.
  const captured: ReadSetShrinkEvent[] = [];

  test("emits ONCE on a shed, never on fresh insert / grow / unchanged", async () => {
    onReadSetShrink((e) => captured.push(e));

    // Fresh insert (no prior row) → NO emit.
    captured.length = 0;
    await persistSnapshot(t.db, "k", "{}", {}, "1", ["a", "b"]);
    expect(captured).toHaveLength(0);

    // Shrink ["a","b"] → ["a"] drops "b" → emit ONCE.
    captured.length = 0;
    await persistSnapshot(t.db, "k", "{}", {}, "2", ["a"]);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      resourceKey: "k",
      droppedTables: ["b"],
      oldTables: ["a", "b"],
      newTables: ["a"],
    });

    // Grow ["a"] → ["a","c"] (no dropped table) → NO emit.
    captured.length = 0;
    await persistSnapshot(t.db, "k", "{}", {}, "3", ["a", "c"]);
    expect(captured).toHaveLength(0);

    // Unchanged ["a","c"] → ["a","c"] → NO emit.
    captured.length = 0;
    await persistSnapshot(t.db, "k", "{}", {}, "4", ["a", "c"]);
    expect(captured).toHaveLength(0);

    // Restore the no-op handler so no later suite inherits this spy.
    onReadSetShrink(() => {});
  });
});

describe("reconcileReadSetTable", () => {
  test("removes the table from non-kept rows, returns changed count, leaves kept rows intact", async () => {
    // `attempts` carries a stale `notifications` edge; the owner row keeps it.
    await persistSnapshot(t.db, "attempts", "{}", {}, "1", [
      "attempts_v",
      "conversations_v",
      "notifications",
    ]);
    await persistSnapshot(t.db, "notifications", "{}", {}, "1", ["notifications"]);

    const changed = await reconcileReadSetTable(t.db, "notifications", ["notifications"]);
    expect(changed).toBe(1);

    // The stale edge is evicted from `attempts`, order otherwise preserved.
    expect((await selectRow("attempts", "{}"))!.tables_read).toEqual([
      "attempts_v",
      "conversations_v",
    ]);
    // The sole legitimate reader row is untouched.
    expect((await selectRow("notifications", "{}"))!.tables_read).toEqual(["notifications"]);
  });
});
