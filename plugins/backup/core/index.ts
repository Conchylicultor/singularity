export interface BackupManifest {
  version: 1;
  createdAt: string;
  trigger: "manual" | "periodic";
  sources: {
    databases: string[];
    secretsIncluded: boolean;
    attachmentsIncluded: boolean;
  };
  sizeBytes: number;
}

export interface BackupArchive {
  archivePath: string;
  stagingDir: string;
  manifest: BackupManifest;
}

export interface BackupTargetResult {
  targetId: string;
  ok: boolean;
  detail?: string;
  needsConsent?: boolean;
}
