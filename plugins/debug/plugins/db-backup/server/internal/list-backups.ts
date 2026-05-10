import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { BACKUPS_DIR } from "@plugins/infra/plugins/paths/server";
import { inspectBackup, type BackupInfo } from "@plugins/database/plugins/admin/server";

export type BackupEntry = {
  id: string;
  dir: string;
  databases: BackupInfo[];
  totalSizeBytes: number;
};

export async function listBackups(): Promise<Response> {
  const baseDir = BACKUPS_DIR;

  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return Response.json({ ok: true, backups: [] });
  }

  const backupDirs = entries
    .filter((e) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(e))
    .sort()
    .reverse();

  const backups: BackupEntry[] = await Promise.all(
    backupDirs.map(async (id) => {
      const dir = join(baseDir, id);
      let dumpFiles: string[];
      try {
        dumpFiles = (await readdir(dir)).filter((f: string) => f.endsWith(".dump"));
      } catch {
        dumpFiles = [];
      }
      const databases = await Promise.all(
        dumpFiles.map((f: string) =>
          inspectBackup(join(dir, f), f.replace(/\.dump$/, "")),
        ),
      );
      const totalSizeBytes = databases.reduce((sum, d) => sum + d.sizeBytes, 0);
      return { id, dir, databases, totalSizeBytes };
    }),
  );

  return Response.json({ ok: true, backups });
}
