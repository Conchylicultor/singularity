import { existsSync } from "node:fs";
import { cp, stat } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import type { BackupSourceReport } from "@plugins/backup/core";
import { configSourceConfig } from "../../shared/config";

async function countFilesAndSize(cwd: string): Promise<{ count: number; sizeBytes: number }> {
  let count = 0;
  let sizeBytes = 0;
  for await (const rel of new Bun.Glob("**/*").scan({ cwd, onlyFiles: true })) {
    count++;
    const s = await stat(`${cwd}/${rel}`);
    sizeBytes += s.size;
  }
  return { count, sizeBytes };
}

export async function assembleConfig(dir: string): Promise<BackupSourceReport> {
  const { enabled } = getConfig(configSourceConfig);

  if (!enabled) {
    return { id: "config", name: "Config", skipped: true, items: [], sizeBytes: 0 };
  }

  const configDir = join(SINGULARITY_DIR, "config");

  if (!existsSync(configDir)) {
    return { id: "config", name: "Config", skipped: false, items: [], sizeBytes: 0 };
  }

  await cp(configDir, dir, { recursive: true });
  const { count, sizeBytes } = await countFilesAndSize(dir);

  return {
    id: "config",
    name: "Config",
    skipped: false,
    items: [{ label: "config", detail: `${count} files`, count }],
    sizeBytes,
  };
}
