import { useMemo, useState, type ReactElement } from "react";
import {
  GanttContainer,
  MultiSpanLane,
  ProfilingContext,
  SpanDetail,
  SpanRow,
  formatDuration,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import {
  opFillClass,
  waitFillClass,
} from "@plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text, SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import type { OpDetail, OpStepWire } from "../../shared/endpoints";
import { getOpDetail } from "../../shared/endpoints";
import { opDetailPane } from "../panes";

function outcomeVariant(
  outcome: string,
): "success" | "info" | "destructive" | "muted" {
  if (outcome === "success") return "success";
  if (outcome === "waiting" || outcome === "running") return "info";
  if (outcome.startsWith("failed") || outcome === "error") return "destructive";
  return "muted";
}

function Stat({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <Stack gap="2xs" className="bg-card px-md py-sm">
      <span className="text-3xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Text as="span" variant="caption" className="font-mono tabular-nums">
        {formatDuration(value)}
      </Text>
    </Stack>
  );
}

/**
 * The op's full span with every wait at its true in-span offset — the detail
 * twin of the Gantt bar, on the op's OWN time axis (origin = `requestedAt`).
 * MultiSpanLane's overlays are exactly this model: absolute, bar-relative, free
 * to gap (the op working between its waits) and to repeat a kind (a build
 * re-queuing for the host grant across duress requeue cycles).
 */
function OpTimeline({ op }: { op: OpDetail }): ReactElement {
  const bars = useMemo(
    () => [
      {
        id: op.opId,
        startMs: 0,
        durationMs: op.totalMs,
        colorClass: opFillClass(op.kind),
        treatment:
          op.outcome === "waiting" || op.outcome === "running"
            ? ("pulse" as const)
            : ("solid" as const),
        overlays: op.waits.map((w) => ({
          startMs: w.startMs,
          ms: w.durationMs,
          colorClass: waitFillClass(w.kind),
        })),
      },
    ],
    [op],
  );

  // An INTERRUPTED op has no known end (totalMs 0) yet may still carry the waits
  // that were on record when it was killed — so the axis is the furthest point
  // anything actually reaches, not totalMs. For a normal op every wait is inside
  // the span and this collapses to totalMs; for an interrupted one the bar is a
  // sliver at the origin and the waits it died in still render at true offsets,
  // which is the whole reason to keep them.
  const axisMs = Math.max(
    op.totalMs,
    ...op.waits.map((w) => w.startMs + w.durationMs),
    1,
  );

  return (
    <Clip className="rounded-md border">
      <GanttContainer title="Timeline" totalMs={axisMs}>
        <Stack gap="none" className="px-lg py-sm">
          <MultiSpanLane
            label={op.kind}
            bars={bars}
            duration={formatDuration(op.totalMs)}
          />
        </Stack>
      </GanttContainer>
    </Clip>
  );
}

/**
 * The step breakdown, on the op's WORK axis (origin = `grantedAt`) — a
 * different origin from the waits above, which is why the two are separate
 * charts rather than one.
 *
 * One row per step at its true `startMs`, so concurrency renders AS concurrency:
 * a standalone `check` runs its checks in parallel, so its steps genuinely
 * cluster and overlap rather than forming a waterfall. Rows are ordered by start
 * so reading order matches the clock — but nothing here implies step N+1 waited
 * on step N; two steps that started together start at the same x.
 */
function OpStepsGantt({
  steps,
  holdMs,
  colorClass,
}: {
  steps: OpStepWire[];
  holdMs: number;
  colorClass: string;
}): ReactElement {
  const [hovered, setHovered] = useState<Span | null>(null);
  const ctxValue = useMemo(
    () => ({ hovered, setHovered, refreshKey: 0 }),
    [hovered, setHovered],
  );
  const spans: Span[] = useMemo(
    () =>
      [...steps]
        .sort((a, b) => a.startMs - b.startMs)
        .map((s, i) => ({
          id: `step:${i}:${s.name}`,
          phase: "work",
          label: s.name,
          startMs: s.startMs,
          durationMs: s.durationMs,
        })),
    [steps],
  );
  const totalMs = Math.max(
    holdMs,
    ...spans.map((s) => s.startMs + s.durationMs),
    1,
  );
  return (
    <ProfilingContext.Provider value={ctxValue}>
      <Clip className="rounded-md border">
        <GanttContainer title="Steps" totalMs={totalMs}>
          <Stack gap="2xs" className="px-lg py-sm">
            {spans.map((s) => (
              <SpanRow key={s.id} span={s} color={colorClass} />
            ))}
          </Stack>
        </GanttContainer>
        <SpanDetail span={hovered} />
      </Clip>
    </ProfilingContext.Provider>
  );
}

export function OpDetailBody(): ReactElement {
  const { opId } = opDetailPane.useParams();
  const openPane = useOpenPane();
  const { data, error } = useEndpoint(getOpDetail, { opId });

  const branchShort = data?.branch.replace(/^claude-web\//, "") ?? opId;

  return (
    <PaneChrome pane={opDetailPane} title="Op">
      {!data ? (
        <Placeholder tone={error ? "error" : "muted"}>
          {error ? "Op not found." : "Loading…"}
        </Placeholder>
      ) : (
        <Stack gap="lg" className="p-lg">
          <Cluster gap="sm">
            <Badge colorClass={`${opFillClass(data.kind)}/15`}>
              {formatStatusLabel(data.kind)}
            </Badge>
            <Text as="span" variant="body" className="truncate font-mono">
              {branchShort}
            </Text>
            <Badge variant={outcomeVariant(data.outcome)}>
              {formatStatusLabel(data.outcome)}
            </Badge>
            {/* The lane explains WHY the op waited: interactive draws from a
                reserved host-CPU floor, background does not. */}
            {data.lane && (
              <Badge variant="muted">{formatStatusLabel(data.lane)} lane</Badge>
            )}
            {data.mode === "from-main" && <Badge variant="warning">from main</Badge>}
            {data.interrupted && <Badge variant="destructive">interrupted</Badge>}
          </Cluster>

          {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 3-column hairline stat grid: the 1px (gap-px) gaps reveal the bg-border as cell separators, a hairline technique the Grid gap ramp can't express */}
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border">
            {/* Wait is the DERIVED sum of every wait; Work is the rest of the
                span. Wait + Work == Total exactly, for every kind, because the
                waits are disjoint intervals inside the span.

                Deliberately NOT `holdMs`: it is `completedAt - grantedAt`, and a
                build grants at the build lock ~1ms in, so its later host-grant /
                duress-valve waits sit INSIDE the hold — labelling that "Hold"
                next to "Wait" reads as work and would overstate a stalled
                build's real work by the whole queue time. `holdMs` is still on
                the wire for anyone who wants the entry-ticket hold. */}
            <Stat label="Wait" value={data.waitMs} />
            <Stat label="Work" value={Math.max(0, data.totalMs - data.waitMs)} />
            <Stat label="Total" value={data.totalMs} />
          </div>

          <OpTimeline op={data} />

          <Stack gap="xs">
            <SectionLabel as="span">Waits</SectionLabel>
            {data.waits.length > 0 ? (
              <Cluster gap="xs">
                {data.waits.map((w, i) => (
                  <Badge
                    key={`${w.kind}:${i}`}
                    colorClass={`${waitFillClass(w.kind)}/15`}
                    title={`+${formatDuration(w.startMs)} into the op`}
                  >
                    {formatStatusLabel(w.kind)} {formatDuration(w.durationMs)}
                  </Badge>
                ))}
              </Cluster>
            ) : (
              <Placeholder tone="muted">
                Never blocked (or logged before wait attribution).
              </Placeholder>
            )}
          </Stack>

          {data.conversationId && (
            <Text
              as="button"
              variant="caption"
              // eslint-disable-next-line layout/no-adhoc-layout -- left-align this lone link button; its Stack siblings stretch full-width
              className="self-start font-medium text-primary hover:underline"
              onClick={() =>
                openPane(
                  conversationPane,
                  { convId: data.conversationId! },
                  { mode: "push" },
                )
              }
            >
              Open conversation →
            </Text>
          )}

          {data.steps.length > 0 ? (
            <OpStepsGantt
              steps={data.steps}
              holdMs={data.holdMs}
              colorClass={opFillClass(data.kind)}
            />
          ) : (
            <Placeholder tone="muted">No step breakdown recorded.</Placeholder>
          )}
        </Stack>
      )}
    </PaneChrome>
  );
}
