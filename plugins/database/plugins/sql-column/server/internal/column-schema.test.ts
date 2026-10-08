/**
 * `columnSchema` against a REAL `pgTable`: the schema a `parsedText` /
 * `parsedJson` column decodes through is recorded on the column drizzle builds
 * (through `.notNull()` and `.default()`), and any other column has none.
 */
import { describe, expect, test } from "bun:test";
import { pgTable, text } from "drizzle-orm/pg-core";
import { z } from "zod";
import { columnSchema } from "./column-schema";
import { parsedJson } from "./parsed-json";
import { parsedText } from "./parsed-text";
import { withWire } from "./wire";

const Status = z.enum(["a", "b"]);
const Shape = z.object({ n: z.number() });

const t = pgTable("column_schema_t", {
  id: text("id").primaryKey(),
  status: parsedText("status", Status).notNull().default("a"),
  shape: parsedJson("shape", Shape),
  wired: withWire(parsedText("wired", Status), {
    schema: z.string(),
    encode: (v: string) => v.toUpperCase(),
  }),
});

describe("columnSchema", () => {
  test("is the schema a parsed column decodes through, through the builder chain", () => {
    expect(columnSchema(t.status)).toBe(Status);
    expect(columnSchema(t.shape)).toBe(Shape);
    // A wire codec on top records beside it, not instead of it.
    expect(columnSchema(t.wired)).toBe(Status);
  });

  test("a column with drizzle's own decoder has none", () => {
    expect(columnSchema(t.id)).toBeUndefined();
  });
});
