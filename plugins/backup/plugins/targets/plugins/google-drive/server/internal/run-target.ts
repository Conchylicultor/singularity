import { basename } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import { getTokenFromCentral } from "@plugins/auth/server";
import type { BackupArchive, BackupTargetResult } from "@plugins/backup/core";
import { googleDriveBackupConfig } from "../../shared/config";
import { GOOGLE_DRIVE_SCOPES } from "../../shared/scopes";
import { ensureFolder } from "./folder";
import { uploadToDrive } from "./upload";
import { pruneOldBackups } from "./retention";

export async function runGoogleDriveTarget(
  archive: BackupArchive,
): Promise<BackupTargetResult> {
  const { enabled, keepLast } = getConfig(googleDriveBackupConfig);
  if (!enabled) {
    return { targetId: "google-drive", ok: true, detail: "disabled" };
  }

  const tokenResult = await getTokenFromCentral({
    providerId: "google",
    scopes: [...GOOGLE_DRIVE_SCOPES],
  });

  if (!tokenResult.ok) {
    if (tokenResult.needsConsent) {
      return {
        targetId: "google-drive",
        ok: false,
        needsConsent: true,
        detail: `Google account not connected or missing Drive scope (${tokenResult.reason})`,
        consent: { providerId: "google", scopes: [...GOOGLE_DRIVE_SCOPES] },
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
