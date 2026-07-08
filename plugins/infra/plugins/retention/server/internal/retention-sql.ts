import { and, lt, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The retention boundary: rows with `column < cutoff` are stale and swept. */
export function retentionCutoff(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() - ttlDays * MS_PER_DAY);
}

/**
 * The DELETE predicate: `column < cutoff` (strict — a row exactly at the cutoff
 * is kept), optionally AND-ed with a consumer scope. Extracted so the cutoff
 * composition is unit-testable without a live DB (render via PgDialect).
 */
export function retentionPredicate(column: PgColumn, cutoff: Date, where?: SQL): SQL {
  const base = lt(column, cutoff);
  // `and(a, b)` with two defined args is always an SQL; the `| undefined` in its
  // type only covers the all-undefined case. Non-null assertion mirrors the
  // `or(...)!` idiom in attachments' orphan-sweep.
  return where ? and(base, where)! : base;
}
