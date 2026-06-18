import { test, expect } from "bun:test";
import { pgTable } from "drizzle-orm/pg-core";
import { build } from "./storage";

test("date → timestamp with time zone", () => {
  const t = pgTable("t", { c: build("c") });
  expect(t.c.getSQLType()).toBe("timestamp with time zone");
});
