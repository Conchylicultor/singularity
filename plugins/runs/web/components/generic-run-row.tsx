import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { RunOutcomeDot } from "@plugins/runs/plugins/run-outcome/web";
import type { UnionRun } from "../../core";
import { formatDuration } from "../internal/format";

export interface RunRowProps {
  run: UnionRun;
}

/**
 * The row for a kind that contributes none of its own.
 *
 * Built strictly from the BASE columns — the ones every kind has — so it says
 * only what is true of every run and never guesses at a domain it does not
 * know. A kind whose row deserves more (a backup's per-target detail, a build's
 * target chips) contributes a `Runs.Row` renderer and this steps aside.
 *
 * The failure message is the one thing given a line of its own: it is the
 * domain's own words about why, and a truncated subtitle is where those go to
 * die.
 */
export function GenericRunRow({ run }: RunRowProps): ReactNode {
  const failed = run.outcome === "failed" || run.outcome === "partial";
  return (
    <Fill>
      <Stack gap="2xs">
        <Cluster gap="xs">
          <Text as="span" variant="body">
            {run.label}
          </Text>
          <Badge variant="muted">{run.kind}</Badge>
          {run.trigger !== null && <Badge variant="muted">{run.trigger}</Badge>}
          {run.namespace !== null && (
            <Badge variant="muted" mono title={run.namespace}>
              {run.namespace}
            </Badge>
          )}
          <Text as="span" variant="caption" tone="muted">
            {formatDuration(run.duration)} ·{" "}
            <RelativeTime date={run.startedAt} />
          </Text>
        </Cluster>
        {failed && run.message !== null && (
          <Text
            as="p"
            variant="caption"
            tone="destructive"
            className="whitespace-pre-wrap"
          >
            {run.message}
          </Text>
        )}
      </Stack>
    </Fill>
  );
}

/**
 * The leading indicator for a kind that contributes none: the shared outcome
 * dot. Always present, because "is this still going" is the first thing anyone
 * reads off the list and no kind has a better answer than the shared one.
 */
export function GenericRunLeading({ run }: RunRowProps): ReactNode {
  return <RunOutcomeDot outcome={run.outcome} />;
}
