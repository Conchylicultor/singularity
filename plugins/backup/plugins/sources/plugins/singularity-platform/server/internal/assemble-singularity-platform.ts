import { existsSync } from "node:fs";
import { cp, stat } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import type { BackupSourceReport } from "@plugins/backup/core";
import { singularityPlatformSourceConfig } from "../../shared/config";

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

export async function assembleSingularityPlatform(dir: string): Promise<BackupSourceReport> {
  const { enabled } = getConfig(singularityPlatformSourceConfig);

  if (!enabled) {
    return { id: "singularity-platform", name: "Singularity Platform", skipped: true, items: [], sizeBytes: 0 };
  }

  const items = [];
  let sizeBytes = 0;

  // auth/ (recursive dir)
  const authDir = join(SINGULARITY_DIR, "auth");
  if (existsSync(authDir)) {
    const dest = join(dir, "auth");
    await cp(authDir, dest, { recursive: true });
    const { count, sizeBytes: dirSize } = await countFilesAndSize(dest);
    sizeBytes += dirSize;
    items.push({ label: "auth", detail: `${count} files` });
  }

  // database.json
  const databaseJsonPath = join(SINGULARITY_DIR, "database.json");
  if (existsSync(databaseJsonPath)) {
    const dest = join(dir, "database.json");
    await cp(databaseJsonPath, dest);
    const s = await stat(dest);
    sizeBytes += s.size;
    items.push({ label: "database.json" });
  }

  // crashes/ (recursive dir)
  const crashesDir = join(SINGULARITY_DIR, "crashes");
  if (existsSync(crashesDir)) {
    const dest = join(dir, "crashes");
    await cp(crashesDir, dest, { recursive: true });
    const { count, sizeBytes: dirSize } = await countFilesAndSize(dest);
    sizeBytes += dirSize;
    items.push({ label: "crashes", detail: `${count} files` });
  }

  return { id: "singularity-platform", name: "Singularity Platform", skipped: false, items, sizeBytes };
}
