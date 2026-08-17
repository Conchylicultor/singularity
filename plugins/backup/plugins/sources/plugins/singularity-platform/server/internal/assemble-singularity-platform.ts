import { existsSync } from "node:fs";
import { cp, stat } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import {
  LEGACY_AUTH_DIR,
  SINGULARITY_DIR,
} from "@plugins/infra/plugins/paths/server";
import type { BackupSourceReport } from "@plugins/backup/core";
import { singularityPlatformSourceConfig } from "../../shared/config";

async function countFilesAndSize(
  cwd: string,
): Promise<{ count: number; sizeBytes: number }> {
  let count = 0;
  let sizeBytes = 0;
  for await (const rel of new Bun.Glob("**/*").scan({ cwd, onlyFiles: true })) {
    count++;
    const s = await stat(`${cwd}/${rel}`);
    sizeBytes += s.size;
  }
  return { count, sizeBytes };
}

export async function assembleSingularityPlatform(
  dir: string,
): Promise<BackupSourceReport> {
  const { enabled } = getConfig(singularityPlatformSourceConfig);

  if (!enabled) {
    return {
      id: "singularity-platform",
      name: "Singularity Platform",
      skipped: true,
      items: [],
      sizeBytes: 0,
    };
  }

  const items = [];
  let sizeBytes = 0;

  // auth/ (recursive dir) — the pre-secrets-store token layout, which `paths`
  // already names as the legacy location rather than this file re-deriving it.
  const authDir = LEGACY_AUTH_DIR;
  if (existsSync(authDir)) {
    const dest = join(dir, "auth");
    await cp(authDir, dest, { recursive: true });
    const { count, sizeBytes: dirSize } = await countFilesAndSize(dest);
    sizeBytes += dirSize;
    items.push({ label: "auth", detail: `${count} files` });
  }

  // database.json — a loose FILE at the data root, deliberately still joined by
  // hand: a DataDir names a directory, and this file has no containing dir of
  // its own to declare yet.
  const databaseJsonPath = join(SINGULARITY_DIR, "database.json");
  if (existsSync(databaseJsonPath)) {
    const dest = join(dir, "database.json");
    await cp(databaseJsonPath, dest);
    const s = await stat(dest);
    sizeBytes += s.size;
    items.push({ label: "database.json" });
  }

  // NO `crashes/` arm. It was the pre-rename spelling of the crash buffer, which
  // `reports` has owned as `reports/` for a long time — nothing has written
  // `crashes/` since, so the arm could only ever copy a stale leftover, and on
  // this machine it silently copied nothing at all. The buffer that DOES exist
  // is short-lived by design (flushed into the reports table on the next boot),
  // so it is not a backup source; it is not re-added here under the new name.

  return {
    id: "singularity-platform",
    name: "Singularity Platform",
    skipped: false,
    items,
    sizeBytes,
  };
}
