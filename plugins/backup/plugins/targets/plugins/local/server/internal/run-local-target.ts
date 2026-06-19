import { readdir, rm } from "node:fs/promises";
import { BACKUPS_DIR } from "@plugins/infra/plugins/paths/server";
import { getConfig } from "@plugins/config_v2/server";
import type { BackupArchive, BackupTargetResult } from "@plugins/backup/core";
import { localBackupConfig } from "../../shared/config";

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

export async function runLocalTarget(
  archive: BackupArchive,
): Promise<BackupTargetResult> {
  const { enabled, keepLast } = getConfig(localBackupConfig);

  if (!enabled) {
    return { targetId: "local", ok: true, detail: "disabled" };
  }

  let entries: string[];
  try {
    entries = await readdir(BACKUPS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { targetId: "local", ok: true, detail: archive.archivePath };
  }

  const dirs = entries
    .filter((e) => TIMESTAMP_RE.test(e))
    .sort()
    .reverse();

  if (keepLast > 0 && dirs.length > keepLast) {
    const toDelete = dirs.slice(keepLast);
    for (const dir of toDelete) {
      await rm(`${BACKUPS_DIR}/${dir}`, { recursive: true, force: true });
    }
  }

  return { targetId: "local", ok: true, detail: archive.archivePath };
}
