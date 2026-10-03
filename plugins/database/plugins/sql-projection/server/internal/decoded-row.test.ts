/**
 * `decodedRow` against hand-built raw rows — the shape `db.execute` hands
 * back: driver values, undecoded (a `timestamptz` as its string).
 *
 * - each field decodes through its own decoder (a column's mapper, a function,
 *   `parsed`), and a NULL skips it — only where the field's type admits NULL
 *   (a nullable column, a `nullable(…)` decoder); elsewhere it fails;
 * - the key set is exact (A31): a missing field and a stray one each fail the
 *   parse, naming the field;
 * - through sql-rows' `executeRows`, a mismatch is a `SqlRowError` naming the
 *   query, and a decoder's own throw propagates as is.
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { decodedRow } from "./decoded-row";
import { nullable, parsed } from "./decoders";
import { SqlProjectionError } from "./errors";

const t = pgTable("t", {
  id: text("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  n: integer("n"),
});

const row = decodedRow({
  id: t.id,
  at: t.at,
  endedAt: t.endedAt,
  count: Number,
  status: parsed(z.enum(["ok", "failed"]), "runs.status"),
});

/** A fake drizzle db whose `execute` answers `rows`. */
const dbOf = (rows: unknown[]) => ({
  execute: () => Promise.resolve({ rows, rowCount: rows.length, fields: [] }),
});

describe("decodedRow", () => {
  test("decodes each field through its decoder; NULL skips it", () => {
    const out = row.parse({
      id: "r1",
      at: "2026-10-01 12:00:00+00",
      endedAt: null,
      count: "3",
      status: "ok",
    });
    expect(out).toEqual({
      id: "r1",
      at: new Date("2026-10-01T12:00:00Z"),
      endedAt: null,
      count: 3,
      status: "ok",
    });
    // The types follow the decoders (a nullable column adds `| null`).
    const typed: {
      id: string;
      at: Date;
      endedAt: Date | null;
      count: number;
      status: "ok" | "failed";
    } = out;
    expect(typed.at).toBeInstanceOf(Date);
  });

  test("a NULL where the type is non-null fails, naming the field; nullable(…) admits it", () => {
    const base = {
      id: "r1",
      at: "2026-10-01 12:00:00+00",
      endedAt: null,
      count: "3",
      status: "ok",
    };
    // A NOT NULL column.
    const notNullCol = row.safeParse({ ...base, at: null });
    expect(notNullCol.success).toBe(false);
    expect(notNullCol.error!.issues[0]!.path).toEqual(["at"]);
    expect(notNullCol.error!.issues[0]!.message).toContain("non-null");
    // A plain function decoder (typed `number`) and `parsed` (typed non-null).
    expect(
      row.safeParse({ ...base, count: null }).error!.issues[0]!.path,
    ).toEqual(["count"]);
    expect(
      row.safeParse({ ...base, status: null }).error!.issues[0]!.path,
    ).toEqual(["status"]);
    // `nullable(…)` — over a NOT NULL column or a function — admits it.
    const loose = decodedRow({ at: nullable(t.at), count: nullable(Number) });
    const out = loose.parse({ at: null, count: null });
    const typed: { at: Date | null; count: number | null } = out;
    expect(typed).toEqual({ at: null, count: null });
    expect(loose.parse({ at: "2026-10-01 12:00:00+00", count: "2" })).toEqual({
      at: new Date("2026-10-01T12:00:00Z"),
      count: 2,
    });
  });

  test("the key set is exact: a missing field and a stray one fail, naming it (A31)", () => {
    const missing = row.safeParse({
      id: "r1",
      at: "2026-10-01 12:00:00+00",
      endedAt: null,
      count: "3",
    });
    expect(missing.success).toBe(false);
    expect(missing.error!.issues[0]!.path).toEqual(["status"]);
    const stray = row.safeParse({
      id: "r1",
      at: "2026-10-01 12:00:00+00",
      endedAt: null,
      count: "3",
      status: "ok",
      extra: 1,
    });
    expect(stray.success).toBe(false);
    expect(stray.error!.issues[0]!.path).toEqual(["extra"]);
    expect(row.safeParse(null).success).toBe(false);
  });

  test("through executeRows: a mismatch is a SqlRowError naming the column; a decoder's throw propagates", async () => {
    let err: unknown;
    try {
      await executeRows(dbOf([{ id: "r1" }]), {
        query: "q",
        row,
        label: "runs.union",
      });
    } catch (e) {
      err = e;
    }
    // sql-rows' SqlRowError: the label, and the field the row lacks.
    expect((err as Error).name).toBe("SqlRowError");
    expect((err as Error).message).toContain("runs.union");

    const bad = {
      id: "r1",
      at: "2026-10-01 12:00:00+00",
      endedAt: null,
      count: "3",
      status: "nope",
    };
    let thrown: unknown;
    try {
      await executeRows(dbOf([bad]), { query: "q", row, label: "runs.union" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SqlProjectionError);
  });
});
