/**
 * `withWire` against a REAL `pgTable`: the codec is recorded on the column
 * drizzle builds (whatever the builder chain did in between), and the wire type
 * rides on that column's type — which is what a consumer's tsc check reads.
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { customType, pgTable, text } from "drizzle-orm/pg-core";
import { columnWireCodec, withWire, type ColumnWire } from "./wire";

const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const wired = (name: string) =>
  withWire(bytes(name), { schema: z.string(), encode: hex });

const t = pgTable("wire_t", {
  id: text("id").primaryKey(),
  required: wired("required").notNull(),
  optional: wired("optional"),
});

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe("withWire", () => {
  test("records the codec on the built column, through `.notNull()`", () => {
    expect(columnWireCodec(t.required)?.encode(Uint8Array.from([1, 255]))).toBe(
      "01ff",
    );
    expect(columnWireCodec(t.optional)?.encode(Uint8Array.from([7]))).toBe(
      "07",
    );
  });

  test("a column that declares none crosses the wire as is", () => {
    expect(columnWireCodec(t.id)).toBeUndefined();
  });

  test("the wire type is on the built column's type — NULL-able adds null", () => {
    const required: Equal<
      ColumnWire<typeof t.required>,
      { wire: string }
    > = true;
    const optional: Equal<
      ColumnWire<typeof t.optional>,
      { wire: string | null }
    > = true;
    const plain: Equal<ColumnWire<typeof t.id>, null> = true;
    expect([required, optional, plain]).toEqual([true, true, true]);
  });

  test("the stored type is unchanged — the column still reads and writes bytes", () => {
    const stored: Equal<typeof t.$inferSelect.required, Uint8Array> = true;
    expect(stored).toBe(true);
    expect(t.required.getSQLType()).toBe("bytea");
  });
});
