import { existsSync } from "node:fs";
import { cp, stat } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import { STORE_PATH, KEY_PATH } from "@plugins/infra/plugins/paths/server";
import type { BackupSourceReport } from "@plugins/backup/core";
import { secretsSourceConfig } from "../../shared/config";

export async function assembleSecrets(dir: string): Promise<BackupSourceReport> {
  const { enabled } = getConfig(secretsSourceConfig);

  if (!enabled) {
    return { id: "secrets", name: "Secrets", skipped: true, items: [], sizeBytes: 0 };
  }

  const items = [];
  let sizeBytes = 0;

  if (existsSync(STORE_PATH)) {
    const dest = join(dir, "secrets.json.enc");
    await cp(STORE_PATH, dest);
    const s = await stat(dest);
    sizeBytes += s.size;
    items.push({ label: "secrets.json.enc", detail: "encrypted" });
  }

  if (existsSync(KEY_PATH)) {
    const dest = join(dir, ".key");
    await cp(KEY_PATH, dest);
    const s = await stat(dest);
    sizeBytes += s.size;
    items.push({ label: ".key" });
  }

  return { id: "secrets", name: "Secrets", skipped: false, items, sizeBytes };
}
