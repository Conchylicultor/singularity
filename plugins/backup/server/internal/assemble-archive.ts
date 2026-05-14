import { mkdir, cp, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  BACKUPS_DIR,
  STORE_PATH,
  KEY_PATH,
  ATTACHMENTS_DIR,
} from "@plugins/infra/plugins/paths/server";
import {
  listDatabases,
  backupDatabase,
} from "@plugins/database/plugins/admin/server";
import type { BackupArchive, BackupManifest } from "@plugins/backup/core";

function formatTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "-")
    .slice(0, 19);
}

export async function assembleArchive(
  trigger: "manual" | "periodic",
): Promise<BackupArchive> {
  const timestamp = formatTimestamp();
  const runDir = join(BACKUPS_DIR, timestamp);
  const stagingDir = join(runDir, "staging");
  const archivePath = join(runDir, "archive.tar.gz");

  await mkdir(join(stagingDir, "db"), { recursive: true });
  await mkdir(join(stagingDir, "secrets"), { recursive: true });

  const allDbs = await listDatabases();
  const targetDbs = allDbs.filter(
    (name) => !name.startsWith("claude-") && !name.startsWith("att-"),
  );
  for (const db of targetDbs) {
    await backupDatabase(db, join(stagingDir, "db", `${db}.dump`));
  }

  let secretsIncluded = false;
  if (existsSync(STORE_PATH)) {
    await cp(STORE_PATH, join(stagingDir, "secrets", "secrets.json.enc"));
    secretsIncluded = true;
  }
  if (existsSync(KEY_PATH)) {
    await cp(KEY_PATH, join(stagingDir, "secrets", ".key"));
  }

  let attachmentsIncluded = false;
  if (existsSync(ATTACHMENTS_DIR)) {
    await cp(ATTACHMENTS_DIR, join(stagingDir, "attachments"), {
      recursive: true,
    });
    attachmentsIncluded = true;
  }

  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    trigger,
    sources: {
      databases: targetDbs,
      secretsIncluded,
      attachmentsIncluded,
    },
    sizeBytes: 0,
  };

  await Bun.write(
    join(stagingDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  const proc = Bun.spawn(["tar", "-czf", archivePath, "-C", stagingDir, "."], {
    stderr: "pipe",
  });
  if ((await proc.exited) !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`tar failed: ${stderr}`);
  }

  const archiveStat = await stat(archivePath);
  manifest.sizeBytes = archiveStat.size;

  await Bun.write(
    join(stagingDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  await rm(stagingDir, { recursive: true, force: true });

  return { archivePath, stagingDir: runDir, manifest };
}
