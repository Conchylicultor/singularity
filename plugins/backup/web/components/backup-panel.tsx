import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { useState } from "react";
import {
  MdBackup,
  MdCheckCircle,
  MdError,
  MdWarning,
  MdExpandMore,
  MdExpandLess,
  MdCloudUpload,
  MdFolder,
} from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { BackupTargetResult } from "@plugins/backup/core";
import { listBackupRuns, runBackup, type BackupRun } from "../../shared/endpoints";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "ok":
      return <MdCheckCircle className="size-4 shrink-0 text-success" />;
    case "partial":
      return <MdWarning className="size-4 shrink-0 text-warning" />;
    case "failed":
      return <MdError className="size-4 shrink-0 text-destructive" />;
    default:
      return (
        <div className="size-4 shrink-0 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
      );
  }
}

function TargetResultRow({ result }: { result: BackupTargetResult }) {
  const Icon = result.targetId === "google-drive" ? MdCloudUpload : MdFolder;
  return (
    <Text as="div" variant="body" className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="font-medium capitalize">{result.targetId}</span>
      {result.ok ? (
        <MdCheckCircle className="size-3.5 text-success" />
      ) : (
        <MdError className="size-3.5 text-destructive" />
      )}
      {result.detail && (
        <Text as="span" variant="caption" className="text-muted-foreground truncate">
          {result.detail}
        </Text>
      )}
    </Text>
  );
}

function BackupRunRow({ run }: { run: BackupRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusIcon status={run.status} />
          <div className="min-w-0">
            <Text as="p" variant="label" className="truncate">
              {new Date(run.startedAt).toLocaleString()}
            </Text>
            <Text as="p" variant="caption" className="text-muted-foreground">
              {run.trigger} ·{" "}
              {run.archiveSizeBytes
                ? formatSize(run.archiveSizeBytes)
                : "in progress"}
              {run.manifest?.sources.databases.length
                ? ` · ${run.manifest.sources.databases.length} DB`
                : ""}
            </Text>
          </div>
        </div>
        {expanded ? (
          <MdExpandLess className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <MdExpandMore className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && run.targetResults && (
        <div className="border-t px-4 py-3 space-y-2">
          {run.targetResults.map((r) => (
            <TargetResultRow key={r.targetId} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BackupPanel() {
  const { data: runs, isLoading } = useEndpoint(listBackupRuns, {});
  const { mutate: triggerBackup, isPending } = useEndpointMutation(runBackup, {
    invalidates: [listBackupRuns],
  });

  return (
    <div className="p-6 max-w-2xl space-y-6">
        <div>
          <Text as="h2" variant="heading">Backup</Text>
          <Text as="p" variant="body" className="text-muted-foreground mt-1">
            Archives the database, secrets, and attachments. Dispatches to
            all enabled storage targets (local, Google Drive).
          </Text>
        </div>

        <Button onClick={() => triggerBackup({})} disabled={isPending}>
          <MdBackup className="size-4 mr-2" />
          {isPending ? "Starting backup…" : "Run Backup Now"}
        </Button>

        <div className="space-y-3">
          <Text
            as="h3"
            variant="label"
            className="font-semibold text-muted-foreground uppercase tracking-wide"
          >
            Backup History
          </Text>
          {isLoading ? (
            <Loading variant="rows" />
          ) : !runs || runs.length === 0 ? (
            <Text as="p" variant="body" className="text-muted-foreground">
              No backups yet. Click above to create one.
            </Text>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <BackupRunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
