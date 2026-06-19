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

  const items = [];
  let sizeBytes = 0;
  for (const db of targetDbs) {
    const out = join(dir, `${db}.dump`);
    await backupDatabase(db, out);
    const info = await inspectBackup(out, db);
    const rows = info.tables.reduce((acc, t) => acc + t.rowCount, 0);
    items.push({
      label: db,
      detail: `${info.tables.length} tables / ${rows} rows`,
      count: info.tables.length,
    });
    sizeBytes += info.sizeBytes;
  }

  return { id: "databases", name: "Databases", skipped: false, items, sizeBytes };
}
