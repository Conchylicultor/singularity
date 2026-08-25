/**
 * The decoders, against hand-built values — including the exact shape the
 * `sql-rows` incident produced (`name[]` arriving as its raw Postgres literal
 * string where `string[]` was declared), which is the case a `sql<string[]>`
 * type argument cannot see and `parsed` throws on.
 *
 * The message assertions matter as much as the throw: a decoder fires several
 * frames inside drizzle's result mapping, so the message is the only thing that
 * can say WHICH projection failed.
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { pgTable, timestamp } from "drizzle-orm/pg-core";
import { nullable, parsed } from "./decoders";
import { SqlProjectionError } from "./errors";

/** A real drizzle COLUMN (not a builder), so `nullable` wraps a true decoder. */
const { createdAt } = pgTable("t", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

describe("parsed", () => {
  test("a matching value passes through, typed", () => {
    const decode = parsed(z.array(z.string()), "tasks_v.dependencies");
    expect(decode(["a", "b"])).toEqual(["a", "b"]);
  });

  test("the incident: `name[]` arriving as its raw literal string", () => {
    // `array_agg(relname)` over a `name` column produces OID 1003, for which pg
    // has no decoder — so the whole array arrives as one Postgres literal while
    // the declared type says `string[]`. Under a `sql<string[]>` type argument
    // this is invisible; downstream, `for (const t of tables)` then walks the
    // string one character at a time.
    const decode = parsed(z.array(z.string()), "fork_plan.tables");
    let err: unknown;
    try {
      decode("{_private_jobs,migrations,graphile_worker}");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SqlProjectionError);
    const e = err as SqlProjectionError;
    expect(e.label).toBe("fork_plan.tables");
    expect(e.expected).toBe("array");
    expect(e.receivedType).toBe("string");
    expect(e.message).toContain("fork_plan.tables");
    expect(e.message).toContain("expected array, received string");
    expect(e.message).toContain("{_private_jobs,migrations,graphile_worker}");
    // The hint is the whole point: it names the cast that fixes it.
    expect(e.message).toContain("Cast the column");
  });

  test("the timestamp trap: a timestamptz string where a Date was declared", () => {
    // Through `db.execute` / a raw projection, drizzle's per-query type-parser
    // override returns timestamptz as its raw string. A `sql<Date>` type
    // argument says otherwise and nothing checks it.
    const decode = parsed(z.date(), "tasks_v.finishedAt");
    expect(() => decode("2026-08-23 17:58:18.780242+02")).toThrow(
      SqlProjectionError,
    );
  });

  test("a string arriving where a string was expected gets no cast hint", () => {
    const decode = parsed(z.enum(["a", "b"]), "tasks_v.status");
    let err: unknown;
    try {
      decode("nope");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SqlProjectionError);
    expect((err as SqlProjectionError).message).not.toContain(
      "Cast the column",
    );
  });

  test("a nested issue is reported at its path, with the whole value shown", () => {
    const decode = parsed(z.array(z.string()), "tasks_v.dependencies");
    let err: unknown;
    try {
      decode(["a", 3]);
    } catch (e) {
      err = e;
    }
    const e = err as SqlProjectionError;
    expect(e.path).toEqual([1]);
    expect(e.message).toContain("at [1]:");
    expect(e.message).toContain('["a",3]');
  });

  test("the zod error is kept as the cause, for the full issue list", () => {
    const decode = parsed(z.array(z.string()), "x.y");
    let err: unknown;
    try {
      decode(1);
    } catch (e) {
      err = e;
    }
    expect((err as SqlProjectionError).cause).toBeInstanceOf(z.ZodError);
  });
});

describe("nullable", () => {
  test("null and undefined pass through as null", () => {
    const decode = nullable(createdAt);
    expect(decode(null)).toBeNull();
    expect(decode(undefined)).toBeNull();
  });

  test("a value is decoded by the wrapped column's own mapper", () => {
    const decode = nullable(createdAt);
    const out = decode("2026-08-23 17:58:18.780242+02");
    expect(out).toBeInstanceOf(Date);
    expect((out as Date).toISOString()).toBe("2026-08-23T15:58:18.780Z");
  });

  test("wrapping a plain function decoder keeps it, plus null", () => {
    const decode = nullable(parsed(z.enum(["a", "b"]), "t.status"));
    expect(decode(null)).toBeNull();
    expect(decode("a")).toBe("a");
    expect(() => decode("c")).toThrow(SqlProjectionError);
  });
});
