/**
 * What became of one source during the assembly.
 *
 * Three states, not two, and a union rather than a `skipped` boolean plus an
 * optional error. A source that THREW is neither "went in" nor "was turned
 * off": before this arm existed the only way to say it was to reject, and a
 * rejection took down the whole archive — so one broken source cost the run
 * its attachments, its secrets and its transcripts as well.
 *
 * `failed` still carries `items` and `sizeBytes`, because a source can fail
 * PART way: the databases source dumps seven databases and one of them refuses
 * its plan. The six that dumped are really in the archive, and a manifest that
 * hid them would be lying in the other direction.
 */
export type BackupSourceOutcome = "included" | "skipped" | "failed";

export interface BackupSourceItem {
  label: string;
  detail?: string;
  count?: number;
}

interface BackupSourceReportBase {
  id: string;
  name: string;
  /** What this source contributed — the entries that ARE in the archive. */
  items: BackupSourceItem[];
  /** Bytes staged by this source, counting only what it actually wrote. */
  sizeBytes: number;
}

/** The source assembled everything it had. */
export interface BackupSourceIncluded extends BackupSourceReportBase {
  outcome: "included";
}

/** The source is switched off in config; it contributed nothing by design. */
export interface BackupSourceSkipped extends BackupSourceReportBase {
  outcome: "skipped";
}

/**
 * The source could not assemble, in whole or in part. `error` is what it said,
 * verbatim, and is rendered on the run's detail pane — so a backup that has
 * been quietly incomplete for three nights says so on its own card.
 */
export interface BackupSourceFailed extends BackupSourceReportBase {
  outcome: "failed";
  error: string;
}

export type BackupSourceReport =
  BackupSourceIncluded | BackupSourceSkipped | BackupSourceFailed;

/**
 * Did this source put anything in the archive?
 *
 * The one reading of the union that both the manifest's source list and the
 * `backup.sourceCount` column take, so the list and the number cannot disagree.
 * A failed source counts: it wrote whatever it got through before it failed,
 * and the archive holds it.
 */
export function backupSourceWentIn(source: BackupSourceReport): boolean {
  return source.outcome !== "skipped";
}

export interface BackupManifest {
  /**
   * 3 — source reports carry an `outcome` (see {@link BackupSourceReport}).
   *
   * v2 rows carry `skipped: boolean` instead and are still read: the decoders
   * map the legacy boolean onto `included` / `skipped`, which is lossless,
   * because a v2 manifest could not express a failed source at all.
   */
  version: 3;
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
