import { mkdir, stat, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { BACKUPS_DIR } from "@plugins/infra/plugins/paths/server";
import type {
  BackupArchive,
  BackupManifest,
  BackupSourceReport,
} from "@plugins/backup/core";
import { BackupSource } from "./contribution";

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
  // Compress into a sidecar first, then atomically rename onto the final path.
  // A killed tar (deploy/sleep mid-run) leaves only this `.partial` file, never
  // a truncated `archive.tar.gz` that would read as a valid-but-incomplete
  // backup. The `finally` below always reclaims staging + the partial.
  const partialPath = `${archivePath}.partial`;

  await mkdir(stagingDir, { recursive: true });

  try {
    // Assemble every source concurrently — each writes into its own staging
    // subdir, so they are independent. Promise.all preserves contribution order
    // in the reports array.
    const sources = BackupSource.getContributions();
    const reports: BackupSourceReport[] = await Promise.all(
      sources.map(async (source) => {
        const dir = join(stagingDir, source.id);
        await mkdir(dir, { recursive: true });
        return source.assemble(dir);
      }),
    );

    const manifest: BackupManifest = {
      version: 2,
      createdAt: new Date().toISOString(),
      trigger,
      sources: reports,
      sizeBytes: 0,
    };

    await Bun.write(
      join(stagingDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );

    const proc = Bun.spawn(["tar", "-czf", partialPath, "-C", stagingDir, "."], {
      stderr: "pipe",
    });
    if ((await proc.exited) !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`tar failed: ${stderr}`);
    }

    const archiveStat = await stat(partialPath);
    manifest.sizeBytes = archiveStat.size;

    // The final `archive.tar.gz` appears only when fully written.
    await rename(partialPath, archivePath);

    return { archivePath, stagingDir: runDir, manifest };
  } finally {
    // Always reclaim staging (and any leftover partial on the error path).
    // On success the rename already moved the partial away, so its rm is a
    // harmless no-op.
    await rm(stagingDir, { recursive: true, force: true });
    await rm(partialPath, { force: true });
  }
}
