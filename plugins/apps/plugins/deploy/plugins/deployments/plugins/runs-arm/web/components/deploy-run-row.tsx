import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  armNumber,
  armText,
  formatDuration,
  type RunRowProps,
} from "@plugins/runs/web";
import { deployRunFields } from "../../core";

// Built once at module eval, not per row: each accessor validates its id and
// type against the arm's own declaration when it is built.
const verbOf = armText(deployRunFields, "deploy.verb");
const phaseFailedOf = armText(deployRunFields, "deploy.phaseFailed");
const commitShaOf = armText(deployRunFields, "deploy.commitSha");
const releaseRunIdOf = armText(deployRunFields, "deploy.releaseRunId");
const exitCodeOf = armNumber(deployRunFields, "deploy.exitCode");

/**
 * A deploy run in the merged list.
 *
 * The one thing this row must not do is summarise `message`. The CLI owns every
 * refusal — this app only spawns `./singularity deploy` and streams its output —
 * so the message is the command's own words about why it would not proceed, and
 * the existing deploy-history pane renders it verbatim and untruncated on
 * purpose. That is preserved here: `whitespace-pre-wrap`, no clamp, no `title`
 * attribute standing in for the text.
 *
 * The failed phase sits beside it because on an `update` — converge, then build,
 * then ship — the message alone does not say which leg died, and that is usually
 * the first question.
 *
 * `releaseRunId` is a plain identifier chip. It points at a `release_runs.id`
 * and clicking through would be genuinely useful, but importing the release
 * plugin here would couple two arms to each other — precisely what the registry
 * exists to prevent. The cross-link belongs in `runs`, as a way for one arm to
 * ask another to open a row it names.
 */
export function DeployRunRow({ run }: RunRowProps): ReactNode {
  const verb = verbOf(run);
  const phaseFailed = phaseFailedOf(run);
  const commitSha = commitShaOf(run);
  const releaseRunId = releaseRunIdOf(run);
  const exitCode = exitCodeOf(run);
  const failed = run.outcome === "failed";

  return (
    <Fill>
      <Stack gap="2xs">
        <Cluster gap="xs">
          <Text as="span" variant="body">
            {run.label}
          </Text>
          <Badge variant="muted">{run.kind}</Badge>
          {verb !== null && <Badge variant="muted">{verb}</Badge>}
          {phaseFailed !== null && (
            <Badge variant="destructive">{phaseFailed}</Badge>
          )}
          {commitSha !== null && (
            <Badge variant="muted" mono title={commitSha}>
              {commitSha.slice(0, 8)}
            </Badge>
          )}
          {releaseRunId !== null && (
            <Badge variant="muted" mono title={releaseRunId}>
              {releaseRunId}
            </Badge>
          )}
          {failed && exitCode !== null && (
            <Badge variant="destructive">exit {exitCode}</Badge>
          )}
          <Text as="span" variant="caption" tone="muted">
            {formatDuration(run.duration)} ·{" "}
            <RelativeTime date={run.startedAt} />
          </Text>
        </Cluster>
        {run.message !== null && (
          <Text
            as="p"
            variant="caption"
            tone={failed ? "destructive" : "muted"}
            className="whitespace-pre-wrap"
          >
            {run.message}
          </Text>
        )}
      </Stack>
    </Fill>
  );
}
