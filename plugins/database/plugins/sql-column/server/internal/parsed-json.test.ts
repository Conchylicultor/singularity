/**
 * The jsonb decoder against a REAL `pgTable`, for the same two reasons
 * `parsed-text.test.ts` uses one:
 *
 *  - `getSQLType()` is `"jsonb"`, which is the whole reason adopting
 *    `parsedJson` generates no migration;
 *  - the error names `table.column`, which depends on drizzle calling the
 *    decoder as a method (`this.mapFrom(v)`). That is measured behaviour, not a
 *    documented contract, so it is pinned here.
 *
 * Plus one this suite has of its own: `parsedJson` **normalizes**. A `z.object`
 * strips undeclared keys in both directions, so that is asserted rather than
 * left to be discovered by whoever loses a key.
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { jsonb, pgTable } from "drizzle-orm/pg-core";
import { parsedJson } from "./parsed-json";
import { SqlColumnError } from "./errors";

const CallerBreakdownSchema = z.object({
  caller: z.string(),
  count: z.number(),
});

const slowOps = pgTable("slow_ops", {
  callers: parsedJson("callers", z.array(CallerBreakdownSchema)).notNull(),
  // A nullable sibling: no `.notNull()`, so drizzle types it `… | null` on its
  // own. The decoder says nothing about nullability and is never handed a null.
  lastCaller: parsedJson("last_caller", CallerBreakdownSchema),
});

describe("the column drizzle builds", () => {
  test("is a plain `jsonb` column, so adopting it needs no migration", () => {
    const plain = pgTable("t", { j: jsonb("j") });
    expect(slowOps.callers.getSQLType()).toBe("jsonb");
    expect(slowOps.callers.getSQLType()).toBe(plain.j.getSQLType());
  });

  test("carries nullability from the builder, not from the decoder", () => {
    expect(slowOps.callers.notNull).toBe(true);
    expect(slowOps.lastCaller.notNull).toBe(false);
  });
});

describe("reading", () => {
  test("a value of the right shape passes through", () => {
    expect(
      slowOps.callers.mapFromDriverValue([{ caller: "boot", count: 3 }]),
    ).toEqual([{ caller: "boot", count: 3 }]);
  });

  test("a value of the wrong shape throws, naming the qualified column", () => {
    let err: unknown;
    try {
      slowOps.callers.mapFromDriverValue([{ caller: "boot", count: "three" }]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SqlColumnError);
    const e = err as SqlColumnError;
    // The qualified label is the measured `this`-binding behaviour. If drizzle
    // ever stops calling the decoder as a method this assertion is what fails.
    expect(e.label).toBe("slow_ops.callers");
    expect(e.direction).toBe("read");
    expect(e.message).toContain("slow_ops.callers");
    expect(e.message).toContain("decoding a value out of Postgres");
    expect(e.cause).toBeInstanceOf(z.ZodError);
  });

  test("a JSON string where an object was declared is NOT absorbed", () => {
    // Drizzle's own `PgJsonb.mapFromDriverValue` re-parses a string and returns
    // the RAW STRING when that fails. `pg` decodes jsonb itself, so a string
    // arriving here means the column does not hold what it claims — and the
    // schema is what says so, rather than a silent pass-through.
    let err: unknown;
    try {
      slowOps.lastCaller.mapFromDriverValue('{"caller":"boot"' as never);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SqlColumnError);
    expect((err as SqlColumnError).receivedType).toBe("string");
  });

  test("a null is not absorbed — drizzle guards it upstream, so reaching the decoder is a bug", () => {
    expect(() => slowOps.callers.mapFromDriverValue(null as never)).toThrow(
      SqlColumnError,
    );
  });
});

describe("writing", () => {
  test("encodes to the JSON text the driver wants", () => {
    expect(
      slowOps.callers.mapToDriverValue([{ caller: "boot", count: 1 }]),
    ).toBe('[{"caller":"boot","count":1}]');
  });

  test("a laundered value throws at the writer, with write-side advice", () => {
    let err: unknown;
    try {
      slowOps.callers.mapToDriverValue([{ caller: "boot" }] as never);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SqlColumnError);
    const e = err as SqlColumnError;
    expect(e.direction).toBe("write");
    expect(e.message).toContain("encoding a value for Postgres");
    // The write-side advice is the opposite of the read-side advice: parse at
    // the boundary that produced the value, do not widen the column.
    expect(e.message).toContain("Parse it at that boundary");
  });
});

describe("it normalizes, not only checks", () => {
  // A `z.object` strips keys it does not declare. That is what makes the
  // declared type TRUE rather than merely asserted — and it is why a schema
  // that must keep every key says so (`.passthrough()`, or a `z.record`).
  test("an undeclared key is stripped on read", () => {
    expect(
      slowOps.lastCaller.mapFromDriverValue({
        caller: "boot",
        count: 1,
        stale: "from an older schema",
      } as never),
    ).toEqual({ caller: "boot", count: 1 });
  });

  test("an undeclared key is stripped on write too", () => {
    expect(
      slowOps.lastCaller.mapToDriverValue({
        caller: "boot",
        count: 1,
        stale: "laundered in",
      } as never),
    ).toBe('{"caller":"boot","count":1}');
  });

  test("a `z.record` keeps every key, by construction", () => {
    const bag = pgTable("bag", {
      payload: parsedJson("payload", z.record(z.string(), z.unknown())),
    });
    expect(bag.payload.mapFromDriverValue({ a: 1, b: { c: 2 } })).toEqual({
      a: 1,
      b: { c: 2 },
    });
  });
});
