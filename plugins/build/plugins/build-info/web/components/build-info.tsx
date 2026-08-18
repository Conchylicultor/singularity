import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { buildHistoryResource, type BuildRun } from "@plugins/build/core";
import { BuildStatusBadge } from "@plugins/build/plugins/build-status/web";
import { buildStatusOf } from "@plugins/build/plugins/build-status/core";
import {
  describeTermination,
  getBuildRunTermination,
} from "@plugins/build/plugins/build-termination/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

function formatDuration(start: Date, end: Date | null): string {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Stack direction="row" gap="lg" align="baseline" justify="between">
      <Text
        as="span"
        variant="caption"
        className={cn(rigidClass(), "text-muted-foreground")}
      >
        {label}
      </Text>
      <Text as="span" variant="body">
        {children}
      </Text>
    </Stack>
  );
}

/**
 * How this run was ended from outside, for the two statuses where that is the
 * whole story — `killed` (a catchable signal reached the build) and
 * `interrupted` (its owner was hard-killed).
 *
 * Its own component so the endpoint hook is not called from `BuildInfo`, which
 * returns early while the run list loads. The fetch is gated on the status, so
 * the overwhelmingly common healthy run costs no request.
 *
 * It renders nothing only when there is genuinely nothing to say — for any
 * killed run it prints a line even when the sender is unknown, because silence
 * here reads as "nothing killed it", which is the exact ambiguity this feature
 * exists to remove.
 */
function TerminationDetail({ run }: { run: BuildRun }) {
  const status = buildStatusOf(run);
  const externallyEnded = status === "killed" || status === "interrupted";
  const { data } = useEndpoint(
    getBuildRunTermination,
    { id: run.id },
    { enabled: externallyEnded },
  );
  // `undefined` is TanStack's "no data yet" — mapped to the `null` that means
  // "not loaded", so an in-flight request never renders as "no record exists".
  const described = describeTermination(status, run.exitCode, data ?? null);
  if (!described) return null;

  return (
    <Stack gap="2xs">
      <Text as="span" variant="caption" className="text-muted-foreground">
        {status === "killed" ? "Signal" : "Termination"}
      </Text>
      {/* A flow container, not a Row: the attribution carries a full ancestry
          chain and must wrap onto as many lines as it needs rather than
          ellipsize away the very pids it exists to name. */}
      <Text as="p" variant="body">
        {described.headline}
      </Text>
      {described.note !== null && (
        <Text as="p" variant="caption" className="text-muted-foreground">
          {described.note}
        </Text>
      )}
    </Stack>
  );
}

export function BuildInfo({ runId }: { runId: string }) {
  const result = useResource(buildHistoryResource);
  if (result.pending) return <Loading />;
  const run = result.data.find((r) => r.id === runId);

  if (!run) {
    return (
      <Text as="p" variant="caption" className="text-muted-foreground">
        Run not found
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Stack direction="row" align="center" gap="sm">
        <BuildStatusBadge run={run} />
        <Badge variant={run.trigger === "auto" ? "info" : "muted"}>
          {run.trigger}
        </Badge>
      </Stack>

      <Stack gap="sm">
        <Row label="Target">
          <Badge variant={run.target === "main" ? "muted" : "info"}>
            {run.target}
          </Badge>
        </Row>
        {run.commitHash && (
          <Row label="Commit">
            {/* eslint-disable-next-line text/no-adhoc-typography -- mono commit-hash chip, intentional inline-code size */}
            <code className="font-mono text-xs">
              {run.commitHash.slice(0, 8)}
            </code>
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
          <span className="tabular-nums">
            {formatDuration(run.startedAt, run.finishedAt)}
          </span>
        </Row>
      </Stack>

      <TerminationDetail run={run} />
    </Stack>
  );
}
