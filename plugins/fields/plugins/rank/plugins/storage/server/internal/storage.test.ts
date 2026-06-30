import { test, expect } from "bun:test";
import { pgTable } from "drizzle-orm/pg-core";
import { build } from "./storage";

test("rank → rank_text", () => {
  const t = pgTable("t", { c: build("c") });
  expect(t.c.getSQLType()).toBe("rank_text");
});
