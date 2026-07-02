import { join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import {
  listDatabases,
  backupDatabase,
  inspectBackup,
} from "@plugins/database/plugins/admin/server";
import type { BackupSourceReport } from "@plugins/backup/core";
import { databasesSourceConfig } from "../../shared/config";

export async function assembleDatabases(
  dir: string,
): Promise<BackupSourceReport> {
  const { enabled } = getConfig(databasesSourceConfig);

  if (!enabled) {
    return { id: "databases", name: "Databases", skipped: true, items: [], sizeBytes: 0 };
  }

  const allDbs = await listDatabases();
  const targetDbs = allDbs.filter(
    (name) => !name.startsWith("claude-") && !name.startsWith("att-"),
  );

  // Dump every target DB concurrently — each pg_dump is an independent
  // subprocess writing its own file, so there is no cross-DB ordering.
  const dumped = await Promise.all(
    targetDbs.map(async (db) => {
      const out = join(dir, `${db}.dump`);
      await backupDatabase(db, out);
      const info = await inspectBackup(out, db);
      const rows = info.tables.reduce((acc, t) => acc + t.rowCount, 0);
      return {
        item: {
          label: db,
          detail: `${info.tables.length} tables / ${rows} rows`,
          count: info.tables.length,
        },
        sizeBytes: info.sizeBytes,
      };
    }),
  );

  const items = dumped.map((d) => d.item);
  const sizeBytes = dumped.reduce((acc, d) => acc + d.sizeBytes, 0);

  return { id: "databases", name: "Databases", skipped: false, items, sizeBytes };
}
