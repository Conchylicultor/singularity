export interface BackupSourceItem {
  label: string;
  detail?: string;
  count?: number;
}

export interface BackupSourceReport {
  id: string;
  name: string;
  skipped: boolean;
  items: BackupSourceItem[];
  sizeBytes: number;
}

export interface BackupManifest {
  version: 2;
  createdAt: string;
  trigger: "manual" | "periodic";
  sources: BackupSourceReport[];
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
  /** When needsConsent, the OAuth provider + scopes the user must grant to fix it. */
  consent?: { providerId: string; scopes: string[] };
}
