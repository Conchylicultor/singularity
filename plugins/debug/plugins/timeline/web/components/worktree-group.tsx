import type { ReactElement } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { MultiSpanLane } from "@plugins/debug/plugins/profiling/web";
import type { TimelineHealthPoint } from "../../shared/frames";
import type { TimelineWindow, WorktreeGroupModel } from "../internal/view-model";
import { HeatStrip } from "./gantt-rows";

/**
 * One worktree's lane group: a header row (name + event count), one
 * MultiSpanLane per source that has events, a thin health heat strip when the
 * worktree reported a health series, and compact per-source error rows for
 * failed fan-out cells (loud-but-resilient — never a blank view).
 */
export function WorktreeGroup({
  group,
  health,
  range,
  cpuCount,
  onSelect,
}: {
  group: WorktreeGroupModel;
  health: TimelineHealthPoint[] | undefined;
  range: TimelineWindow;
  cpuCount: number;
  onSelect: (barId: string) => void;
}): ReactElement {
  return (
    <Stack gap="none">
      <Inset t="xs">
        <Line className="gap-sm">
          <Text as="span" variant="caption" className="font-mono font-medium">
            {group.worktree}
          </Text>
          {group.eventCount > 0 && (
            <Badge variant="muted">
              {group.eventCount} event{group.eventCount === 1 ? "" : "s"}
            </Badge>
          )}
        </Line>
      </Inset>
      {group.lanes.map((lane) => (
        <MultiSpanLane
          key={lane.source}
          label={lane.source}
          bars={lane.bars}
          onBarClick={onSelect}
        />
      ))}
      {health !== undefined && health.length > 0 && (
        <HeatStrip
          label="health"
          samples={health}
          range={range}
          kind="backend"
          cpuCount={cpuCount}
        />
      )}
      {group.errors.map((err) => (
        <Line key={err.source} className="gap-sm">
          <Badge variant="warning" mono>
            {err.source}
          </Badge>
          <Text as="span" variant="caption" className="text-warning" title={err.error}>
            {err.error}
          </Text>
        </Line>
      ))}
    </Stack>
  );
}
