import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { BackupManifest, BackupTargetResult } from "@plugins/backup/core";

export const _backupRuns = pgTable("backup_runs", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  archiveSizeBytes: integer("archive_size_bytes"),
  manifest: jsonb("manifest").$type<BackupManifest>(),
  targetResults: jsonb("target_results").$type<BackupTargetResult[]>(),
});
