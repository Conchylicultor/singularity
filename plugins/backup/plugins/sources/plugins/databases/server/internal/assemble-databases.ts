import { join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import {
  listDatabases,
  backupDatabase,
  backupExclusions,
  inspectBackup,
} from "@plugins/database/plugins/admin/server";
import type { TableStat } from "@plugins/database/plugins/admin/server";
import type { BackupSourceReport } from "@plugins/backup/core";
import { databasesSourceConfig } from "../../shared/config";

export async function assembleDatabases(
  dir: string,
): Promise<BackupSourceReport> {
  const { enabled } = getConfig(databasesSourceConfig);

  if (!enabled) {
    return {
      id: "databases",
      name: "Databases",
      skipped: true,
      items: [],
      sizeBytes: 0,
    };
  }

  // Read once, before any dump: it throws in a process that never collected
  // contributions, which must fail the source rather than dump everything.
  const exclusions = backupExclusions();
  const allDbs = await listDatabases();
  const targetDbs = allDbs.filter(
    (name) => !name.startsWith("claude-") && !name.startsWith("att-"),
  );

  // Dump every target DB concurrently — each pg_dump is an independent
  // subprocess writing its own file, so there is no cross-DB ordering.
  const dumped = await Promise.all(
    targetDbs.map(async (db) => {
      const out = join(dir, `${db}.dump`);
      const plan = await backupDatabase(db, out, exclusions);
      const info = await inspectBackup(out, db, plan.excludedTables);
      return {
        item: {
          label: db,
          detail: describeDump(info.tables),
          count: info.tables.length,
        },
        sizeBytes: info.sizeBytes,
      };
    }),
  );

  const items = dumped.map((d) => d.item);
  const sizeBytes = dumped.reduce((acc, d) => acc + d.sizeBytes, 0);

  return {
    id: "databases",
    name: "Databases",
    skipped: false,
    items,
    sizeBytes,
  };
}

// e.g. "135 tables / 71934 rows (rows of 1 table left out: traces)". The row
// total counts only rows the archive holds; a left-out table is still counted
// as a table, because its DDL is in the archive.
function describeDump(tables: readonly TableStat[]): string {
  const rows = tables.reduce(
    (acc, t) => (t.rowsExcluded ? acc : acc + t.rowCount),
    0,
  );
  const base = `${tables.length} tables / ${rows} rows`;
  const excluded = tables.filter((t) => t.rowsExcluded).map((t) => t.name);
  if (excluded.length === 0) return base;
  const noun = excluded.length === 1 ? "table" : "tables";
  return `${base} (rows of ${excluded.length} ${noun} left out: ${excluded.join(", ")})`;
}
