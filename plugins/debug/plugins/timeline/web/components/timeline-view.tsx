import { useMemo, useState, type ReactElement } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { GanttContainer } from "@plugins/debug/plugins/profiling/web";
import { groupIncidents } from "@plugins/debug/plugins/trace/plugins/pane/web";
import { TIMELINE_SOURCES } from "../../core";
import { HOST_LANE } from "../../shared/frames";
import { useTimelineStream } from "../internal/use-timeline-stream";
import {
  buildGroups,
  collectBarEvents,
  LOOKBACK_PRESETS,
  mergeHealth,
  okEvents,
  sourceColorClass,
  type LookbackId,
} from "../internal/view-model";
import { buildBands, incidentInputs, intervalEvents } from "../internal/bands";
import { ScanProgress } from "./scan-progress";
import { WallclockAxis, IncidentBandLayer, IncidentBadgeRow, HeatStrip } from "./gantt-rows";
import { WorktreeGroup } from "./worktree-group";
import { DetailStrip } from "./detail-strip";

/**
 * The Timeline tab of Debug → Slow Events: every worktree's slow events
 * (traces, slow-ops, reports, builds, boots) on one wall-clock Gantt — host
 * lane first, a health heat strip per lane group, and translucent cross-
 * worktree incident bands behind the lanes. Pull-only: fetches on mount, on
 * Refresh, and on lookback change; never live, never polled.
 */
export function TimelineView(): ReactElement {
  const [lookback, setLookback] = useState<LookbackId>("1h");
  const lookbackMs = LOOKBACK_PRESETS.find((p) => p.id === lookback)!.ms;
  const { range, chunks, health, total, status, error, reload } =
    useTimelineStream(lookbackMs);
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);

  // The browser runs on the same host as the cluster (single-instance-per-user
  // deployment), so its core count is the honest denominator for load ratios.
  const cpuCount = navigator.hardwareConcurrency || 8;

  const healthByLane = useMemo(() => mergeHealth(health), [health]);
  const groups = useMemo(
    () =>
      range
        ? buildGroups(chunks, [...healthByLane.keys()], range)
        : [],
    [chunks, healthByLane, range],
  );
  const barEvents = useMemo(() => collectBarEvents(groups), [groups]);
  const bands = useMemo(() => {
    if (!range) return [];
    // ALL interval events across every worktree feed one sweep-union — the
    // cross-worktree correlation falls out of the shared grouping for free.
    const intervals = intervalEvents(okEvents(chunks));
    return buildBands(intervals, groupIncidents(incidentInputs(intervals)), range);
  }, [chunks, range]);

  const hostSamples = healthByLane.get(HOST_LANE);
  const selected = selectedBarId !== null ? (barEvents.get(selectedBarId) ?? null) : null;

  const okCells = chunks.filter((c) => c.ok).length;
  const failedCells = chunks.length - okCells;
  const eventCount = groups.reduce((n, g) => n + g.eventCount, 0);
  const isEmpty =
    groups.length === 0 && hostSamples === undefined && status === "done";

  return (
    // h-full (not `fill`): the tabbed-view host mounts this inside its scroll
    // body, which is a plain block — h-full bounds the column to the visible
    // area so the header/detail-strip pin and only the lanes scroll.
    <Column
      className="h-full"
      header={
        <Inset x="md" y="sm" className="border-b">
          <Stack gap="xs">
            <Stack direction="row" gap="md" align="center" justify="between">
              <div className="w-64">
                {status === "streaming" && (
                  <ScanProgress received={chunks.length} total={total} />
                )}
                {status === "done" && (
                  <Text as="span" variant="caption" tone="muted">
                    {eventCount} event{eventCount === 1 ? "" : "s"} · {okCells} cell
                    {okCells === 1 ? "" : "s"} merged
                    {failedCells > 0 && (
                      <span className="text-warning"> · {failedCells} failed</span>
                    )}
                  </Text>
                )}
              </div>
              <Stack direction="row" gap="sm" align="center">
                <SegmentedControl
                  options={LOOKBACK_PRESETS.map((p) => ({ id: p.id, label: p.label }))}
                  value={lookback}
                  onChange={setLookback}
                />
                <Button
                  variant="outline"
                  loading={status === "streaming"}
                  onClick={() => void reload()}
                >
                  Refresh
                </Button>
              </Stack>
            </Stack>
            <Stack direction="row" gap="md" align="center" justify="between">
              <Cluster gap="xs">
                {TIMELINE_SOURCES.filter((s) => s !== "health").map((source) => (
                  <Badge
                    key={source}
                    variant="muted"
                    mono
                    icon={<StatusDot colorClass={sourceColorClass(source)} />}
                  >
                    {source}
                  </Badge>
                ))}
                <Badge variant="warning">warning</Badge>
                <Badge variant="destructive">error</Badge>
              </Cluster>
              <Text as="span" variant="caption" tone="muted">
                Sources keep their own retention — traces ≈ 7 d, health ≈ 2 d.
              </Text>
            </Stack>
          </Stack>
        </Inset>
      }
      body={
        status === "error" && error !== null ? (
          <Inset pad="lg">
            <Placeholder tone="error">{error}</Placeholder>
          </Inset>
        ) : isEmpty ? (
          <Inset pad="lg">
            <Placeholder>No events in this window.</Placeholder>
          </Inset>
        ) : range ? (
          <Inset x="md" y="sm">
            <GanttContainer title="Timeline" totalMs={range.toMs - range.fromMs}>
              <WallclockAxis range={range} />
              {bands.length > 0 && <IncidentBadgeRow bands={bands} />}
              <Overlay behind={<IncidentBandLayer bands={bands} />}>
                <Stack gap="xs">
                  {hostSamples !== undefined && hostSamples.length > 0 && (
                    <Stack gap="none">
                      <Inset t="xs">
                        <Text as="div" variant="caption" className="font-mono font-medium">
                          {HOST_LANE}
                        </Text>
                      </Inset>
                      <HeatStrip
                        label="load avg"
                        samples={hostSamples}
                        range={range}
                        kind="host"
                        cpuCount={cpuCount}
                      />
                    </Stack>
                  )}
                  {groups.map((group) => (
                    <WorktreeGroup
                      key={group.worktree}
                      group={group}
                      health={healthByLane.get(group.worktree)}
                      range={range}
                      cpuCount={cpuCount}
                      onSelect={setSelectedBarId}
                    />
                  ))}
                </Stack>
              </Overlay>
            </GanttContainer>
          </Inset>
        ) : null
      }
      footer={
        selected !== null ? (
          <DetailStrip event={selected} onClose={() => setSelectedBarId(null)} />
        ) : undefined
      }
    />
  );
}
