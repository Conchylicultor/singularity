import { z } from "zod";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import {
  BackupManifestSchema,
  BackupTargetResultSchema,
} from "../../shared/endpoints";

export const _backupRuns = pgTable(
  "backup_runs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"),
    archiveSizeBytes: integer("archive_size_bytes"),
    // Both decode through the schemas in `shared/endpoints.ts`, which is what
    // makes the column's type and the decoded shape one declaration. `manifest`
    // is the wide one on purpose — see `BackupManifestSchema`: v1 rows exist,
    // and a column that decodes has to accept what is really there.
    manifest: parsedJson("manifest", BackupManifestSchema),
    targetResults: parsedJson(
      "target_results",
      z.array(BackupTargetResultSchema),
    ),
  },
  (t) => [
    // Covers the unified runs query's per-arm subselect: `ORDER BY started_at
    // DESC, id ASC LIMIT n`. Without it every page of every scroll is a top-N
    // heapsort over the whole ledger — the union's O(window) argument is
    // precisely that each arm walks its own index instead. `id` is in the index
    // because it is the keyset's tiebreak, so the seek never leaves the index to
    // break a tie.
    //
    // No namespace column to lead with, and that is not an omission: a backup is
    // host-global, so this arm carries no worktree predicate to serve. See the
    // arm's CLAUDE.md.
    index("backup_runs_started_id_idx").on(t.startedAt.desc(), t.id),
  ],
);
