import type { ReactElement } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  extractionStatus,
  type EventSource,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import { useEventSourceType } from "../internal/source-types";
import {
  CADENCE_LABEL,
  EXTRACTION_STATUS_HINT,
  EXTRACTION_STATUS_LABEL,
  EXTRACTION_STATUS_VARIANT,
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
  const extraction = extractionStatus(source);

  return (
    <Fill>
      <Stack gap="2xs">
        <Line className="gap-sm">
          <Fill>
            {/*
              A disabled source's name is muted, so the whole row reads "off"
              from the first glance rather than leaving the chip below to carry
              the fact alone. There is deliberately no icon up here any more:
              the chip already says `Disabled` in words, and two indicators for
              one fact is exactly the noise this row is shedding — the reader
              had to check both to learn nothing extra.
            */}
            <Text
              variant="body"
              tone={source.enabled ? "default" : "muted"}
              className="font-medium"
            >
              {source.name}
            </Text>
          </Fill>
          <Text variant="caption" tone="muted">
            {typeLabel}
          </Text>
        </Line>
        {/*
          ONE chip, answering one question — now with a three-way precedence:
          `Disabled` > `Running` > the extraction status.

          `Disabled` wins outright because the extraction status is then a fact
          about the PAST that no longer describes the row: a source switched off
          last month still remembers that its final run failed, and painting
          `Failed` on it demands attention for something the user already dealt
          with by switching it off. It is also the state the row's own control
          is set to, so the chip and the switch agree.

          Below that, while a run is in flight the live `running` state wins —
          it is transient and the most interesting thing about the row at that
          moment. Every other moment the row shows what the last extraction
          produced.

          The other two `status` values are deliberately never painted here.
          `idle` says nothing anyone wants: every healthy source is idle almost
          all of the time, so the chip was a constant. And `error` is strictly
          subsumed — a terminal failure always writes a failed run, so the
          extraction status says `failed` too, while a TRANSIENT failure leaves
          `status: idle` and only the extraction status tells the truth. So this
          chip is never less informative and often more, and showing both would
          be two chips competing to answer the same question.
        */}
        <Line className="gap-sm">
          {!source.enabled ? (
            /*
              `muted`, sharing a tint with `Never run` on purpose. Every other
              variant is a coloured verdict about how the source is DOING —
              `success`/`warning`/`destructive`/`info` — and an off source is
              making no claim of that kind, so the honest paint is the quiet
              one. The accent (`primary`) was the alternative and is wrong for
              the opposite reason: it would make the loudest thing in a
              deliberately dimmed row the badge saying the row is off. Nothing
              is lost to the shared tint — the two chips say different words,
              and this one sits under a name that is muted with it.
            */
            <Badge
              variant="muted"
              // Says all of what disabling does, not just the scheduler half:
              // the events dropping out of the list is the effect a user
              // notices first and would otherwise read as data loss.
              title="Disabled — the scheduler skips it and its events are hidden"
            >
              Disabled
            </Badge>
          ) : source.status === "running" ? (
            <Badge variant={SOURCE_STATUS_VARIANT.running}>
              {SOURCE_STATUS_LABEL.running}
            </Badge>
          ) : (
            <Badge
              variant={EXTRACTION_STATUS_VARIANT[extraction]}
              title={EXTRACTION_STATUS_HINT[extraction]}
            >
              {EXTRACTION_STATUS_LABEL[extraction]}
            </Badge>
          )}
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
