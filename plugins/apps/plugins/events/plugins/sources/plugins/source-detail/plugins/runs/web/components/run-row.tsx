import type { ReactElement } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { EventSourceRun } from "@plugins/apps/plugins/events/plugins/events-core/core";
import {
  RUN_OUTCOME_LABEL,
  RUN_OUTCOME_VARIANT,
  describeRun,
  formatDuration,
} from "@plugins/apps/plugins/events/plugins/sources/web";

/**
 * One run: outcome chip, the human sentence, duration, and when it started.
 *
 * `unchanged` runs are rendered exactly like the others — they are the answer to
 * "why did nothing happen", and hiding or dimming them away is what makes a
 * working cache look like a broken source.
 */
export function RunRow({ run }: { run: EventSourceRun }): ReactElement {
  const duration = formatDuration(run.durationMs);
  return (
    <Fill>
      <Line className="gap-sm">
        <Badge variant={RUN_OUTCOME_VARIANT[run.outcome]}>
          {RUN_OUTCOME_LABEL[run.outcome]}
        </Badge>
        <Fill>
          <Text variant="caption" tone="muted">
            {describeRun(run)}
          </Text>
        </Fill>
        {duration && (
          <Text variant="caption" tone="muted">
            {duration}
          </Text>
        )}
        <Text variant="caption" tone="muted">
          <RelativeTime date={run.startedAt} />
        </Text>
      </Line>
    </Fill>
  );
}
