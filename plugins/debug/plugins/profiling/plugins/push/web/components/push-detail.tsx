import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  GanttContainer,
  ProfilingContext,
  SpanDetail,
  SpanRow,
  formatDuration,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import type {
  PushDetail,
  PushStep,
} from "../../shared/endpoints";
import { getPushDetail } from "../../shared/endpoints";
import { pushDetailPane } from "../panes";

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

function PushStepsGantt({
  steps,
  holdMs,
}: {
  steps: PushStep[];
  holdMs: number;
}): ReactElement {
  const [hovered, setHovered] = useState<Span | null>(null);
  const ctxValue = useMemo(() => ({ hovered, setHovered, refreshKey: 0 }), [hovered, setHovered]);
  const spans: Span[] = steps.map((s, i) => ({
    id: `step:${i}:${s.name}`,
    phase: "push",
    label: s.name,
    startMs: s.startMs,
    durationMs: s.durationMs,
  }));
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
              <SpanRow key={s.id} span={s} color="bg-success" />
            ))}
          </Stack>
        </GanttContainer>
        <SpanDetail span={hovered} />
      </Clip>
    </ProfilingContext.Provider>
  );
}

export function PushDetailBody(): ReactElement {
  const { pushId } = pushDetailPane.useParams();
  const openPane = useOpenPane();
  const [data, setData] = useState<PushDetail | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchEndpoint(getPushDetail, { pushId });
      setData(result);
    } catch (err) {
      if (err instanceof TypeError) return;
      setError(true);
    }
  }, [pushId]);

  useEffect(() => {
    void load();
  }, [load]);

  const branchShort = data?.branch.replace(/^claude-web\//, "") ?? pushId;

  return (
    <PaneChrome pane={pushDetailPane} title="Push">
      {!data ? (
        <Placeholder tone={error ? "error" : "muted"}>
          {error ? "Push not found." : "Loading…"}
        </Placeholder>
      ) : (
        <Stack gap="lg" className="p-lg">
          <Cluster gap="sm">
            <Text as="span" variant="body" className="truncate font-mono">{branchShort}</Text>
            <Badge variant={outcomeVariant(data.outcome)}>
              {formatStatusLabel(data.outcome)}
            </Badge>
            {data.mode === "from-main" && (
              <Badge variant="warning">from main</Badge>
            )}
            {data.interrupted && (
              <Badge variant="destructive">interrupted</Badge>
            )}
          </Cluster>

          {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 4-column hairline stat grid: the 1px (gap-px) gaps reveal the bg-border as cell separators, a hairline technique the Grid gap ramp can't express */}
          <div className="grid grid-cols-4 gap-px overflow-hidden rounded-md border bg-border">
            <Stat label="Pre-lock" value={data.preLockMs} />
            <Stat label="Wait" value={data.waitMs} />
            <Stat label="Hold" value={data.holdMs} />
            <Stat label="Total" value={data.totalMs} />
          </div>

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
            <PushStepsGantt steps={data.steps} holdMs={data.holdMs} />
          ) : (
            <Placeholder tone="muted">No step breakdown recorded.</Placeholder>
          )}
        </Stack>
      )}
    </PaneChrome>
  );
}
