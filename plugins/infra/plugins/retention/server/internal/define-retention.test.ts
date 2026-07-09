import { describe, expect, test } from "bun:test";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { defineRetention } from "./define-retention";
import { getGrowthBounds } from "./growth-bounds";

// Throwaway physical schemas (no live DB). Each test uses a UNIQUE table name:
// `.register()` also writes the process-global jobRegistry and throws on a
// duplicate job name, so two tests must never share a table.
const definedNotMounted = pgTable("dr_defined_not_mounted", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
});
const definedAndMounted = pgTable("dr_defined_and_mounted", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
});

describe("defineRetention — coverage ⇔ mounted (G1 regression)", () => {
  test("defineRetention alone records NO growth bound", () => {
    defineRetention({ table: definedNotMounted, ttlDays: 7 });
    // The policy is defined but never mounted (register() not called) → the
    // registry must not list it. Recording at define time would be the G1 lie.
    expect(getGrowthBounds().has("dr_defined_not_mounted")).toBe(false);
  });

  test("calling .register() records a {kind:'ttl'} bound", async () => {
    const job = defineRetention({ table: definedAndMounted, ttlDays: 7 });
    expect(getGrowthBounds().has("dr_defined_and_mounted")).toBe(false);

    await job.register();

    expect(getGrowthBounds().get("dr_defined_and_mounted")).toEqual({
      kind: "ttl",
      ttlDays: 7,
    });
  });

  test("throws loudly when the retention column is missing", () => {
    const noColumn = pgTable("dr_no_column", { id: text("id").primaryKey() });
    expect(() => defineRetention({ table: noColumn, ttlDays: 7 })).toThrow(
      /no column "createdAt"/,
    );
  });
});
