import { useState, useEffect, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import type { BackupManifest, BackupTargetResult } from "@plugins/backup/core";

interface BackupRun {
  id: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  archiveSizeBytes: number | null;
  manifest: BackupManifest | null;
  targetResults: BackupTargetResult[] | null;
}

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
      return <MdCheckCircle className="size-4 shrink-0 text-green-500" />;
    case "partial":
      return <MdWarning className="size-4 shrink-0 text-yellow-500" />;
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
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="font-medium capitalize">{result.targetId}</span>
      {result.ok ? (
        <MdCheckCircle className="size-3.5 text-green-500" />
      ) : (
        <MdError className="size-3.5 text-destructive" />
      )}
      {result.detail && (
        <span className="text-xs text-muted-foreground truncate">
          {result.detail}
        </span>
      )}
    </div>
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
            <p className="text-sm font-medium truncate">
              {new Date(run.startedAt).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {run.trigger} ·{" "}
              {run.archiveSizeBytes
                ? formatSize(run.archiveSizeBytes)
                : "in progress"}
              {run.manifest?.sources.databases.length
                ? ` · ${run.manifest.sources.databases.length} DB`
                : ""}
            </p>
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
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<BackupRun[] | null>(null);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/backup/runs");
    const data = (await res.json()) as BackupRun[];
    setRuns(data);
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const runBackup = async () => {
    setLoading(true);
    try {
      await fetch("/api/backup/run", { method: "POST" });
      // Poll briefly since the job runs async
      setTimeout(() => void loadRuns(), 2000);
      setTimeout(() => void loadRuns(), 5000);
      setTimeout(() => void loadRuns(), 10000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Backup</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Archives the database, secrets, and attachments. Dispatches to
            all enabled storage targets (local, Google Drive).
          </p>
        </div>

        <Button onClick={runBackup} disabled={loading}>
          <MdBackup className="size-4 mr-2" />
          {loading ? "Starting backup…" : "Run Backup Now"}
        </Button>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Backup History
          </h3>
          {runs === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No backups yet. Click above to create one.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <BackupRunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
