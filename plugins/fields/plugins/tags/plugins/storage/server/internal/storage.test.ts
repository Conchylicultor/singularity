/**
 * The tags column is a `jsonb` array of strings that really decodes — this used
 * to be the one storage contribution in the repo that asserted its type, and
 * these tests are what make the replacement's claim checkable.
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { is } from "drizzle-orm";
import { pgTable, PgCustomColumn } from "drizzle-orm/pg-core";
import { SqlColumnError } from "@plugins/database/plugins/sql-column/server";
import { decode } from "./storage";

const t = pgTable("tags_storage_probe", {
  tags: decode("tags", z.array(z.string())),
});

describe("the column drizzle builds", () => {
  test("is `jsonb`, so adopting the decoder needs no migration", () => {
    expect(t.tags.getSQLType()).toBe("jsonb");
    expect(is(t.tags, PgCustomColumn)).toBe(true);
  });
});

describe("reading", () => {
  test("an array of strings passes through", () => {
    expect(t.tags.mapFromDriverValue(["salsa", "bachata"])).toEqual([
      "salsa",
      "bachata",
    ]);
  });

  test("a non-string element throws, naming the qualified column", () => {
    let err: unknown;
    try {
      t.tags.mapFromDriverValue(["salsa", 7]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SqlColumnError);
    expect((err as SqlColumnError).label).toBe("tags_storage_probe.tags");
  });
});

describe("writing", () => {
  test("encodes to the JSON text the driver wants", () => {
    expect(t.tags.mapToDriverValue(["salsa"])).toBe('["salsa"]');
  });

  test("a laundered value throws at the writer", () => {
    expect(() => t.tags.mapToDriverValue([7] as never)).toThrow(SqlColumnError);
  });
});
