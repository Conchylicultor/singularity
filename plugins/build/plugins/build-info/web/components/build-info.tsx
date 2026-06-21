import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { buildHistoryResource } from "@plugins/build/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

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
      <Badge variant="warning" icon={<StatusDot size="md" colorClass="bg-warning animate-pulse" />}>
        Running
      </Badge>
    );
  }
  if (exitCode === 0) {
    return (
      <Badge variant="success" icon={<StatusDot size="md" colorClass="bg-success" />}>
        Success
      </Badge>
    );
  }
  if (exitCode === -1) {
    return (
      <Badge variant="muted" icon={<StatusDot size="md" colorClass="bg-muted-foreground/60" />}>
        Superseded
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" icon={<StatusDot size="md" colorClass="bg-destructive" />}>
      Failed (exit {exitCode})
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-lg">
      <Text as="span" variant="caption" className="shrink-0 text-muted-foreground">{label}</Text>
      <Text as="span" variant="body">{children}</Text>
    </div>
  );
}

export function BuildInfo({ runId }: { runId: string }) {
  const result = useResource(buildHistoryResource);
  if (result.pending) return <Loading />;
  const run = result.data.find((r) => r.id === runId);

  if (!run) {
    return <Text as="p" variant="caption" className="text-muted-foreground">Run not found</Text>;
  }

  return (
    <Stack gap="md">
      <Stack direction="row" align="center" gap="sm">
        <StatusBadge exitCode={run.exitCode} finished={run.finishedAt !== null} />
        <Badge variant={run.trigger === "auto" ? "info" : "muted"}>
          {run.trigger}
        </Badge>
      </Stack>

      <Stack gap="sm">
        {run.commitHash && (
          <Row label="Commit">
            {/* eslint-disable-next-line text/no-adhoc-typography -- mono commit-hash chip, intentional inline-code size */}
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
      </Stack>
    </Stack>
  );
}
