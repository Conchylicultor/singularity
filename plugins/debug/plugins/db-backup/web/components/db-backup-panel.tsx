import { useState } from "react";
import { MdBackup, MdCheckCircle, MdError } from "react-icons/md";
import { Button } from "@/components/ui/button";

type BackupResult = {
  ok: true;
  outDir: string;
  databases: { name: string; file: string }[];
};

type BackupError = {
  ok: false;
  error: string;
};

export function DbBackupPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackupResult | BackupError | null>(null);

  const runBackup = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/debug/backup-db", { method: "POST" });
      const data = (await res.json()) as BackupResult | BackupError;
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-lg space-y-6">
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
              <p className="text-xs text-muted-foreground font-mono break-all">
                {result.outDir}
              </p>
              <ul className="text-sm space-y-1">
                {result.databases.map((db) => (
                  <li key={db.name} className="text-muted-foreground">
                    {db.name}.dump
                  </li>
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
    </div>
  );
}
