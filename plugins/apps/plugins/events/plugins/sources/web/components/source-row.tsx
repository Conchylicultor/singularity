import type { ReactElement } from "react";
import { MdPauseCircleOutline } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { EventSource } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { useEventSourceType } from "../internal/source-types";
import {
  CADENCE_LABEL,
  SOURCE_STATUS_LABEL,
  SOURCE_STATUS_VARIANT,
} from "../internal/format";

/**
 * One source row body: name + type on the first line, run state on the second.
 *
 * The type is rendered from the live registry (its contributed label), so an
 * uninstalled type's rows read `type: shotgun (not installed)` instead of
 * silently looking like every other row. Owns no click target and no leading
 * slot — the DataView list wraps this in its own selectable `Row`.
 */
export function SourceRow({ source }: { source: EventSource }): ReactElement {
  const lookup = useEventSourceType(source.type);
  const typeLabel =
    lookup.status === "registered"
      ? lookup.type.label
      : `${source.type} (not installed)`;

  return (
    <Fill>
      <Stack gap="2xs">
        <Line className="gap-sm">
          <Fill>
            <Text variant="body" className="font-medium">
              {source.name}
            </Text>
          </Fill>
          {!source.enabled && (
            <MdPauseCircleOutline
              className="icon-auto text-muted-foreground"
              title="Disabled — the scheduler skips this source"
            />
          )}
          <Text variant="caption" tone="muted">
            {typeLabel}
          </Text>
        </Line>
        <Line className="gap-sm">
          <Badge variant={SOURCE_STATUS_VARIANT[source.status]}>
            {SOURCE_STATUS_LABEL[source.status]}
          </Badge>
          <Fill>
            <Text variant="caption" tone="muted">
              {CADENCE_LABEL[source.refresh]}
            </Text>
          </Fill>
          {source.lastRunAt && (
            <Text variant="caption" tone="muted">
              <RelativeTime date={source.lastRunAt} />
            </Text>
          )}
        </Line>
      </Stack>
    </Fill>
  );
}
