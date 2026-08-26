import { z } from "zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import {
  BackupManifestSchema,
  BackupTargetResultSchema,
} from "../../shared/endpoints";

export const _backupRuns = pgTable("backup_runs", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  archiveSizeBytes: integer("archive_size_bytes"),
  // Both decode through the SAME schemas the list endpoint's response declares,
  // so the column's type and the wire type are one declaration. `manifest` is
  // the wide one on purpose — see `BackupManifestSchema`: v1 rows exist, and a
  // column that decodes has to accept what is really there.
  manifest: parsedJson("manifest", BackupManifestSchema),
  targetResults: parsedJson(
    "target_results",
    z.array(BackupTargetResultSchema),
  ),
});
