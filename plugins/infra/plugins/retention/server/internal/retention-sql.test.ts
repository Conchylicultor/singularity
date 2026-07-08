import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { PgDialect, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { retentionCutoff, retentionPredicate } from "./retention-sql";

// Throwaway physical schema (no live DB) — just to hand real PgColumns to the
// predicate builder and render the SQL.
const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
});

const dialect = new PgDialect();

describe("retentionCutoff", () => {
  test("subtracts ttlDays from now", () => {
    const now = new Date("2026-07-08T00:00:00.000Z");
    expect(retentionCutoff(now, 7).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  test("a row older than the cutoff is deleted, a newer one is kept (lt semantics)", () => {
    const now = new Date("2026-07-08T00:00:00.000Z");
    const cutoff = retentionCutoff(now, 7);
    const day = 24 * 60 * 60 * 1000;
    const older = new Date(now.getTime() - 8 * day); // 8d old → past 7d TTL
    const newer = new Date(now.getTime() - 6 * day); // 6d old → within TTL
    // `retentionPredicate` renders `created_at < cutoff`, so deletion ⇔ ts < cutoff.
    expect(older.getTime() < cutoff.getTime()).toBe(true); // deleted
    expect(newer.getTime() < cutoff.getTime()).toBe(false); // kept
  });
});

describe("retentionPredicate", () => {
  test("renders a strict less-than on the column with the cutoff as the sole param", () => {
    const cutoff = new Date("2026-07-01T00:00:00.000Z");
    const { sql, params } = dialect.sqlToQuery(
      retentionPredicate(evidence.createdAt, cutoff),
    );
    expect(sql).toBe(`"evidence"."created_at" < $1`);
    // drizzle maps the Date through the timestamp column's driver serializer.
    expect(params).toEqual([cutoff.toISOString()]);
  });

  test("AND-composes an extra where onto the age predicate", () => {
    const cutoff = new Date("2026-07-01T00:00:00.000Z");
    const { sql, params } = dialect.sqlToQuery(
      retentionPredicate(evidence.createdAt, cutoff, eq(evidence.id, "keep-me")),
    );
    expect(sql).toBe(`("evidence"."created_at" < $1 and "evidence"."id" = $2)`);
    expect(params).toEqual([cutoff.toISOString(), "keep-me"]);
  });
});
