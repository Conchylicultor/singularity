import type { ReactElement } from "react";
import { MdRepeat } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { EventRecord } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { EVENT_CATEGORY_OPTIONS } from "../../core";
import { formatEventWhen, formatPlace } from "../internal/format";

const CATEGORY_LABEL = new Map(
  EVENT_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * One event row body: a two-line block — title + recurrence marker + when on the
 * first line, category + place + price on the second.
 *
 * Owns no click target and no leading slot: the DataView list wraps this in its
 * own selectable `Row`. Each line is a `Line` (single-line container) whose ONE
 * `Fill` holds the leaf that truncates under pressure, so the trailing metadata
 * keeps a real track and can never be overlapped by a long title or venue name.
 */
export function EventRow({ event }: { event: EventRecord }): ReactElement {
  const place = formatPlace(event.venue, event.city);

  return (
    <Fill>
      <Stack gap="2xs">
        <Line className="gap-sm">
          <Fill>
            <Text variant="body" className="font-medium">
              {event.title}
            </Text>
          </Fill>
          {event.recurring && (
            <MdRepeat
              className="icon-auto text-muted-foreground"
              title={event.recurrenceLabel ?? "Recurring"}
            />
          )}
          <Text variant="caption" tone="muted">
            {formatEventWhen(event.startsAt, event.allDay)}
          </Text>
        </Line>
        <Line className="gap-sm">
          <Badge variant="muted">
            {CATEGORY_LABEL.get(event.category) ?? event.category}
          </Badge>
          <Fill>
            <Text variant="caption" tone="muted">
              {place ?? ""}
            </Text>
          </Fill>
          {event.price && (
            <Text variant="caption" tone="muted">
              {event.price}
            </Text>
          )}
        </Line>
      </Stack>
    </Fill>
  );
}
