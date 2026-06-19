import { existsSync } from "node:fs";
import { cp, stat } from "node:fs/promises";
import { getConfig } from "@plugins/config_v2/server";
import { ATTACHMENTS_DIR } from "@plugins/infra/plugins/paths/server";
import type { BackupSourceReport } from "@plugins/backup/core";
import { attachmentsSourceConfig } from "../../shared/config";

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

export async function assembleAttachments(dir: string): Promise<BackupSourceReport> {
  const { enabled } = getConfig(attachmentsSourceConfig);

  if (!enabled) {
    return { id: "attachments", name: "Attachments", skipped: true, items: [], sizeBytes: 0 };
  }

  if (!existsSync(ATTACHMENTS_DIR)) {
    return { id: "attachments", name: "Attachments", skipped: false, items: [], sizeBytes: 0 };
  }

  await cp(ATTACHMENTS_DIR, dir, { recursive: true });
  const { count, sizeBytes } = await countFilesAndSize(dir);

  return {
    id: "attachments",
    name: "Attachments",
    skipped: false,
    items: [{ label: "attachments", detail: `${count} files`, count }],
    sizeBytes,
  };
}
