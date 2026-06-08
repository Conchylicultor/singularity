import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  GanttContainer,
  ProfilingContext,
  SpanDetail,
  SpanRow,
  formatDuration,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/badge/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import type {
  PushDetail,
  PushStep,
} from "../../shared/endpoints";
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
    <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
      <span className="text-3xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums">
        {formatDuration(value)}
      </span>
    </div>
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
    <ProfilingContext.Provider value={{ hovered, setHovered, refreshKey: 0 }}>
      <div className="overflow-hidden rounded border">
        <GanttContainer title="Steps" totalMs={totalMs}>
          <div className="space-y-0.5 px-4 py-2">
            {spans.map((s) => (
              <SpanRow key={s.id} span={s} color="bg-success" />
            ))}
          </div>
        </GanttContainer>
        <SpanDetail span={hovered} />
      </div>
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
      const res = await fetch(
        `/api/debug/profiling/push/${encodeURIComponent(pushId)}`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      setData((await res.json()) as PushDetail);
    } catch (err) {
      if (err instanceof TypeError) return;
      throw err;
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
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm">{branchShort}</span>
            <Badge variant={outcomeVariant(data.outcome)}>
              {formatStatusLabel(data.outcome)}
            </Badge>
            {data.mode === "from-main" && (
              <Badge variant="warning">from main</Badge>
            )}
            {data.interrupted && (
              <Badge variant="destructive">interrupted</Badge>
            )}
          </div>

          <div className="grid grid-cols-4 gap-px overflow-hidden rounded border bg-border">
            <Stat label="Pre-lock" value={data.preLockMs} />
            <Stat label="Wait" value={data.waitMs} />
            <Stat label="Hold" value={data.holdMs} />
            <Stat label="Total" value={data.totalMs} />
          </div>

          {data.conversationId && (
            <button
              className="self-start text-xs font-medium text-primary hover:underline"
              onClick={() =>
                openPane(
                  conversationPane,
                  { convId: data.conversationId! },
                  { mode: "push" },
                )
              }
            >
              Open conversation →
            </button>
          )}

          {data.steps.length > 0 ? (
            <PushStepsGantt steps={data.steps} holdMs={data.holdMs} />
          ) : (
            <Placeholder tone="muted">No step breakdown recorded.</Placeholder>
          )}
        </div>
      )}
    </PaneChrome>
  );
}
