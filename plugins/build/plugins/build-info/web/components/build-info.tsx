import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { buildHistoryResource } from "@plugins/build/core";
import { cn } from "@/lib/utils";

function formatDuration(start: Date, end: Date | null): string {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function StatusBadge({ exitCode, finished }: { exitCode: number | null; finished: boolean }) {
  if (!finished) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
        <span className="block size-2 rounded-full bg-warning animate-pulse" />
        Running
      </span>
    );
  }
  if (exitCode === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
        <span className="block size-2 rounded-full bg-success" />
        Success
      </span>
    );
  }
  if (exitCode === -1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <span className="block size-2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
        Superseded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
      <span className="block size-2 rounded-full bg-destructive" />
      Failed (exit {exitCode})
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export function BuildInfo({ runId }: { runId: string }) {
  const result = useResource(buildHistoryResource);
  const run = result.pending ? undefined : result.data.find((r) => r.id === runId);

  if (!run) {
    return <p className="text-xs text-muted-foreground">Run not found</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <StatusBadge exitCode={run.exitCode} finished={run.finishedAt !== null} />
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            run.trigger === "auto"
              ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
          )}
        >
          {run.trigger}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {run.commitHash && (
          <Row label="Commit">
            <code className="font-mono text-xs">{run.commitHash.slice(0, 8)}</code>
          </Row>
        )}
        <Row label="Started">
          <RelativeTime date={run.startedAt} />
        </Row>
        {run.finishedAt && (
          <Row label="Finished">
            <RelativeTime date={run.finishedAt} />
          </Row>
        )}
        <Row label="Duration">
          <span className="tabular-nums">{formatDuration(run.startedAt, run.finishedAt)}</span>
        </Row>
      </div>
    </div>
  );
}
