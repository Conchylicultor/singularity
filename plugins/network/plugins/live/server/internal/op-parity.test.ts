/**
 * Parity suite for the filter op table: every op, over every column type the
 * language supports and with NULLs mixed in, answered twice — in memory
 * (core's `testLiveClause`) and by a real Postgres (`liveClauseSql` over a
 * TEMP table on a throwaway database) — and the two answers must be the same
 * id set. This is what keeps "a filter can be evaluated in memory" true.
 *
 * Run: `./singularity test plugins/network/plugins/live`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server/testing";
import {
  liveOps,
  testLiveClause,
  type LiveClause,
  type LiveOpId,
  type LiveScalar,
} from "@plugins/network/plugins/live/core";
import { liveClauseSql } from "./op-sql";

type Column = "txt" | "num" | "flag" | "ts";

// Values per column (NULLs included). Strings exercise C-collation order:
// case, a prefix, a non-ASCII BMP char above U+E000 and an astral char, which
// UTF-16 code-unit order would sort the other way round.
const VALUES: Record<Column, (LiveScalar | null)[]> = {
  txt: ["apple", "Apple", "app", "banana", "", "ﬁx", "\u{1F600}", "zeta", null],
  num: [-2.5, -1, 0, 1, 2, 3.75, 100, null],
  flag: [true, false, null],
  ts: [
    "2026-01-01T00:00:00.000Z",
    "2026-06-15T12:30:00.000Z",
    "2026-06-15T12:30:00.001Z",
    "2027-01-01T00:00:00.000Z",
    null,
  ],
};

const SQL_TYPE: Record<Column, string> = {
  txt: "text",
  num: "double precision",
  flag: "boolean",
  ts: "timestamptz",
};

// Operands per column: every present value, plus values absent from the data.
const OPERANDS: Record<Column, LiveScalar[]> = {
  txt: ["apple", "app", "b", "", "ﬁ", "\u{1F600}", "￿", "zz"],
  num: [-3, -1, 0, 1.5, 3.75, 1000],
  flag: [true, false],
  ts: [
    "2026-06-15T12:30:00.000Z",
    "2026-03-01T00:00:00.000Z",
    "2028-01-01T00:00:00.000Z",
  ],
};

function clausesFor(column: Column): LiveClause[] {
  const ops = Object.keys(liveOps) as LiveOpId[];
  const operands = OPERANDS[column];
  const lists: LiveScalar[][] = [
    [],
    [operands[0]!],
    operands.slice(0, 3),
    [...operands],
  ];
  return ops.flatMap((op): LiveClause[] => {
    switch (liveOps[op].operand) {
      case "value":
        return operands.map((operand) => ({ column, op: op as "eq", operand }));
      case "list":
        return lists.map((operand) => ({ column, op: op as "in", operand }));
      case "flag":
        return [true, false].map((operand) => ({
          column,
          op: "isNull",
          operand,
        }));
    }
  });
}

let t: TestDb;
let client: Client;
let db: NodePgDatabase;

beforeAll(async () => {
  t = await createTestDb({ prefix: "live_ops_test" });
  // TEMP tables live on one session, so every statement rides this client.
  client = new Client({ connectionString: t.connectionString });
  await client.connect();
  db = drizzle(client);
  for (const column of Object.keys(VALUES) as Column[]) {
    await db.execute(
      sql.raw(
        `CREATE TEMP TABLE live_ops_${column} (id int PRIMARY KEY, v ${SQL_TYPE[column]})`,
      ),
    );
    for (const [id, v] of VALUES[column].entries()) {
      await db.execute(
        sql`INSERT INTO ${sql.raw(`live_ops_${column}`)} (id, v) VALUES (${id}, ${v})`,
      );
    }
  }
});

afterAll(async () => {
  await client.end();
  await t.drop();
});

describe("op table parity: in memory vs Postgres", () => {
  test("the cluster collates text as C (code-point order)", async () => {
    const r = await db.execute<{ c: string }>(
      sql`SELECT datcollate AS c FROM pg_database WHERE datname = current_database()`,
    );
    expect(["C", "POSIX"]).toContain(r.rows[0]!.c);
  });

  for (const column of Object.keys(VALUES) as Column[]) {
    test(`${column}: every op and operand agrees`, async () => {
      const values = VALUES[column];
      const target = sql.raw("v");
      let checked = 0;
      for (const clause of clausesFor(column)) {
        const expected = values
          .map((v, id) => (testLiveClause(v, clause) ? id : -1))
          .filter((id) => id >= 0);
        const r = await db.execute<{ id: number }>(
          sql`SELECT id FROM ${sql.raw(`live_ops_${column}`)} WHERE ${liveClauseSql(target, clause)} ORDER BY id`,
        );
        const actual = r.rows.map((row) => row.id);
        expect({ clause, ids: actual }).toEqual({ clause, ids: expected });
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
    });
  }
});
