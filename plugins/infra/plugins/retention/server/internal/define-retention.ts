import { getTableName, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob, type JobFactory } from "@plugins/infra/plugins/jobs/server";
import { declareGrowthBound } from "./growth-bounds";
import { retentionCutoff, retentionPredicate } from "./retention-sql";

// Daily at 04:00 UTC — off the interactive peak, mirroring debug.trace-cleanup's
// nightly-sweep cadence. Retention is a slow-moving bound; a missed tick is
// harmless (next tick sweeps the accumulated backlog).
const DEFAULT_CRON = "0 4 * * *";
const DEFAULT_COLUMN = "createdAt";
// A transiently-broken sweep must not become a dead-job storm; kept low like
// the trace-cleanup precedent.
const MAX_ATTEMPTS = 3;

// Cron payloads are built from `input.parse({})`, so the input schema must parse
// an empty object. Retention jobs carry no per-run input and ignore events.
const RETENTION_INPUT = z.object({});
const RETENTION_EVENT = z.never();

export type RetentionJob = JobFactory<
  string,
  typeof RETENTION_INPUT,
  typeof RETENTION_EVENT
>;

export interface RetentionSpec {
  /** The table to sweep. Its name (drizzle `getTableName`) derives the job id. */
  table: PgTable;
  /** Timestamp column compared against the cutoff. Defaults to `"createdAt"`. */
  column?: string;
  /** Rows older than this many days are deleted. */
  ttlDays: number;
  /** Cron (5-field UTC). Defaults to nightly `"0 4 * * *"`. */
  cron?: string;
  /**
   * Run the sweep in EVERY worktree backend, not just main. Default `false`
   * (main-only). Set `true` only for tables that live in the per-worktree DB
   * fork (`_reports`, `entity_versions`) — a table in the shared/main DB must
   * stay main-only so N worktrees don't race N sweeps over the same rows.
   */
  perWorktree?: boolean;
  /** Extra scope AND-ed onto the age predicate (e.g. only a subset of rows). */
  where?: SQL;
}

/**
 * Thin wrapper over `defineJob`: a scheduled sweep that deletes rows older than
 * `ttlDays`. Returns the same `JobFactory` `defineJob` returns — the consumer
 * mounts it via `register: [retentionJob]` on its `ServerPluginDefinition`.
 *
 * The `defineRetention` call itself IS the table's growth bound. But the bound
 * is recorded only in the returned factory's `register()` (below), never here —
 * see the comment there.
 */
export function defineRetention(spec: RetentionSpec): RetentionJob {
  const tableName = getTableName(spec.table);
  const columnKey = spec.column ?? DEFAULT_COLUMN;
  const column = (spec.table as unknown as Record<string, PgColumn | undefined>)[
    columnKey
  ];
  if (!column) {
    throw new Error(
      `[retention] table "${tableName}" has no column "${columnKey}" — pass a valid \`column\` to defineRetention`,
    );
  }

  const job = defineJob({
    name: `retention.${tableName}`,
    input: RETENTION_INPUT,
    event: RETENTION_EVENT,
    dedup: "singleton",
    schedule: { cron: spec.cron ?? DEFAULT_CRON, perWorktree: spec.perWorktree ?? false },
    maxAttempts: MAX_ATTEMPTS,
    run: async () => {
      // Cutoff computed per tick (not captured at define time) so a long-lived
      // worker sweeps against a fresh "now" each run.
      const cutoff = retentionCutoff(new Date(), spec.ttlDays);
      await db.delete(spec.table).where(retentionPredicate(column, cutoff, spec.where));
    },
  });

  return {
    ...job,
    // Coverage ⇔ mounted, BY CONSTRUCTION. The bound is recorded here — next to
    // the wrapped job's own registry write — so it exists iff the consumer put
    // this factory in `register: [...]`. A policy that is defined but never
    // mounted (its sweep never runs) records NOTHING, so it can never masquerade
    // as a covered table. Recording at call time instead would let a dead policy
    // lie about coverage. (See growth-bounds.ts for why a true set matters.)
    //
    // `Registration.register()` is `void | Promise<void>`, so the inner write is
    // awaited: the bound is declared only once the job registry write has
    // actually landed (it throws on a duplicate job name), never before.
    async register() {
      await job.register();
      declareGrowthBound(tableName, { kind: "ttl", ttlDays: spec.ttlDays });
    },
  };
}
