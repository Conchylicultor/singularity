import { useState, useEffect, useCallback } from "react";
import { MdBackup, MdCheckCircle, MdError, MdExpandMore, MdExpandLess } from "react-icons/md";
import { Button } from "@/components/ui/button";

type TableStat = {
  name: string;
  rowCount: number;
};

type DumpStats = {
  name: string;
  sizeBytes: number;
  tables: TableStat[];
};

type BackupEntry = {
  id: string;
  dir: string;
  databases: DumpStats[];
  totalSizeBytes: number;
};

type BackupResult = {
  ok: true;
  outDir: string;
  databases: { name: string; file: string }[];
};

type BackupError = {
  ok: false;
  error: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimestamp(id: string): string {
  const sep = id.indexOf("_");
  if (sep === -1) return id;
  const iso = `${id.slice(0, sep)}T${id.slice(sep + 1).replace(/-/g, ":")}`;
  return new Date(iso).toLocaleString();
}

function DbStats({ db }: { db: DumpStats }) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono font-medium">{db.name}</span>
        <span className="text-xs text-muted-foreground">{formatSize(db.sizeBytes)}</span>
      </div>
      {db.tables.length > 0 && (
        <div className="rounded border divide-y text-xs">
          {db.tables.map((t) => (
            <div key={t.name} className="flex items-center justify-between px-3 py-1.5">
              <span className="font-mono text-muted-foreground">{t.name}</span>
              <span className="tabular-nums">{t.rowCount.toLocaleString()} {t.rowCount === 1 ? "row" : "rows"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BackupEntryRow({ entry }: { entry: BackupEntry }) {
  const [expanded, setExpanded] = useState(false);
  const totalTables = entry.databases.reduce((s, d) => s + d.tables.length, 0);

  return (
    <div className="rounded-md border overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <MdCheckCircle className="size-4 shrink-0 text-green-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{formatTimestamp(entry.id)}</p>
            <p className="text-xs text-muted-foreground">
              {entry.databases.length} {entry.databases.length === 1 ? "database" : "databases"} ·{" "}
              {totalTables} {totalTables === 1 ? "table" : "tables"} ·{" "}
              {formatSize(entry.totalSizeBytes)}
            </p>
          </div>
        </div>
        {expanded ? (
          <MdExpandLess className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <MdExpandMore className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t divide-y">
          {entry.databases.map((db) => (
            <DbStats key={db.name} db={db} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DbBackupPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackupResult | BackupError | null>(null);
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/backup-db");
      const data = (await res.json()) as { ok: true; backups: BackupEntry[] } | { ok: false; error: string };
      if (data.ok) setBackups(data.backups);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  const runBackup = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/debug/backup-db", { method: "POST" });
      const data = (await res.json()) as BackupResult | BackupError;
      setResult(data);
      if (data.ok) void loadBackups();
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">DB Backup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Dumps all non-worktree Postgres databases to{" "}
          <code className="font-mono text-xs">~/.backups/singularity/</code>
        </p>
      </div>

      <Button onClick={runBackup} disabled={loading}>
        <MdBackup className="size-4 mr-2" />
        {loading ? "Running backup…" : "Run Backup"}
      </Button>

      {result && (
        <div className="rounded-md border p-4 space-y-3">
          {result.ok ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                <MdCheckCircle className="size-4" />
                Backup complete
              </div>
              <p className="text-xs text-muted-foreground font-mono break-all">{result.outDir}</p>
              <ul className="text-sm space-y-1">
                {result.databases.map((db) => (
                  <li key={db.name} className="text-muted-foreground">{db.name}.dump</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <MdError className="size-4 mt-0.5 shrink-0" />
              <span>{result.error}</span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Existing Backups
        </h3>
        {backups === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backups yet.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((entry) => (
              <BackupEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
