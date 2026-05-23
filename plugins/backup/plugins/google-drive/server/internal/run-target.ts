import { basename } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import { getTokenFromCentral } from "@plugins/auth/server";
import type { BackupArchive, BackupTargetResult } from "@plugins/backup/core";
import { googleDriveBackupConfig } from "../../shared/config";
import { ensureFolder } from "./folder";
import { uploadToDrive } from "./upload";
import { pruneOldBackups } from "./retention";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export async function runGoogleDriveTarget(
  archive: BackupArchive,
): Promise<BackupTargetResult> {
  const { enabled, keepLast } = getConfig(googleDriveBackupConfig);
  if (!enabled) {
    return { targetId: "google-drive", ok: true, detail: "disabled" };
  }

  const tokenResult = await getTokenFromCentral({
    providerId: "google",
    scopes: [DRIVE_SCOPE],
  });

  if (!tokenResult.ok) {
    if (tokenResult.needsConsent) {
      return {
        targetId: "google-drive",
        ok: false,
        needsConsent: true,
        detail: `Google account not connected or missing Drive scope (${tokenResult.reason})`,
      };
    }
    return {
      targetId: "google-drive",
      ok: false,
      detail: "message" in tokenResult ? tokenResult.message : "unknown error",
    };
  }

  const { accessToken } = tokenResult;
  const folderId = await ensureFolder(accessToken);

  const filename = `singularity-backup-${basename(archive.stagingDir)}.tar.gz`;
  const { webViewLink } = await uploadToDrive(
    archive.archivePath,
    folderId,
    filename,
    accessToken,
  );

  await pruneOldBackups(folderId, keepLast, accessToken);

  return { targetId: "google-drive", ok: true, detail: webViewLink };
}
