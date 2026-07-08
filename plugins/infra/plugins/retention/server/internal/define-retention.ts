import { getTableName, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob, type JobFactory } from "@plugins/infra/plugins/jobs/server";
import {
  declareFirehose,
  declareRetentionCoverage,
} from "../../shared/internal/firehose-registry";
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
  /**
   * Declare this table a firehose (unbounded-growth). Registers it into the
   * firehose registry so the `retention:firehose-bounded` check sees it — and
   * because this call also creates a retention policy, the table is
   * automatically covered.
   */
  firehose?: boolean;
}

/**
 * Thin wrapper over `defineJob`: a scheduled sweep that deletes rows older than
 * `ttlDays`. Returns the same `JobFactory` `defineJob` returns — the consumer
 * mounts it via `register: [retentionJob]` on its `ServerPluginDefinition`.
 *
 * Side effect at call time: registers the table into the retention-coverage set
 * (and, when `firehose`, the firehose set) read by the firehose check.
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

  // Coverage is recorded eagerly (call time), so importing a consumer module
  // that declares retention populates the registry the check reads.
  declareRetentionCoverage(tableName);
  if (spec.firehose) declareFirehose(tableName, { cascadeOwner: false });

  return defineJob({
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
}

/**
 * Declare a firehose table whose growth is bounded WITHOUT a TTL sweep — either
 * by an FK `onDelete: "cascade"` to an owner (`cascadeOwner: true`), or as a
 * plain declaration that still owes a `defineRetention` (the check then fails
 * until one exists). FK-cascade is a declared flag, not introspected: the check
 * only ever holds table names.
 */
export function markFirehose(
  table: PgTable,
  opts?: { cascadeOwner?: boolean },
): void {
  declareFirehose(getTableName(table), { cascadeOwner: opts?.cascadeOwner ?? false });
}
