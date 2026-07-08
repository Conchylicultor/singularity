import { useMemo, useState, type ReactElement } from "react";
import {
  useEndpoint,
  getEndpointErrorMessage,
  EndpointError,
} from "@plugins/infra/plugins/endpoints/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  GanttContainer,
  MultiSpanLane,
  formatDuration,
} from "@plugins/debug/plugins/profiling/web";
import {
  Trace,
  getTrace,
  type TraceSelection,
} from "@plugins/debug/plugins/trace/plugins/engine/web";
import type { TraceSnapshot } from "@plugins/debug/plugins/trace/plugins/engine/core";

// Detail render: load one trace's full snapshot, then paint the unified Gantt —
// the trip row (rendered here from the generic trigger, naming no class) + one
// dispatched Trace.Lane per snapshot.events section in registry (insertion)
// order. A bar/chip click feeds the shared bottom detail strip.
export function TraceDetail({ id }: { id: string }): ReactElement {
  const { data, error, isLoading } = useEndpoint(getTrace, { id });

  if (isLoading) {
    return (
      <Center axis="both" className="h-full">
        <Loading />
      </Center>
    );
  }
  if (error) {
    const notFound = error instanceof EndpointError && error.status === 404;
    return (
      <Center axis="both" className="h-full p-2xl text-center">
        <Placeholder tone={notFound ? "muted" : "error"}>
          {notFound ? `No trace with id "${id}".` : getEndpointErrorMessage(error)}
        </Placeholder>
      </Center>
    );
  }
  if (!data) {
    return (
      <Center axis="both" className="h-full">
        <Loading />
      </Center>
    );
  }

  return <TraceGantt snapshot={data.snapshot} />;
}

function TraceGantt({ snapshot }: { snapshot: TraceSnapshot }): ReactElement {
  const [selected, setSelected] = useState<TraceSelection | null>(null);
  const totalMs = Math.max(1, snapshot.atMs - snapshot.windowStartMs);

  // Trip row: the triggering op, anchored to the window's right edge (the trip
  // instant). Rendered generically from `trigger` — the pane names no class.
  const tripBar = useMemo(() => {
    const dur = Math.min(snapshot.trigger.durationMs, totalMs);
    return {
      id: "trip",
      startMs: Math.max(0, totalMs - dur),
      durationMs: dur,
      colorClass: "bg-primary",
      treatment: "solid" as const,
    };
  }, [snapshot.trigger.durationMs, totalMs]);

  const sections = Object.entries(snapshot.events);

  return (
    <Stack gap="none">
      <div className="border-b px-lg py-sm">
        <Trace.TriggerSummary.Dispatch trace={snapshot} />
      </div>

      <GanttContainer title="Window" totalMs={totalMs}>
        <div className="border-b bg-primary/5">
          <Stack direction="row" align="center" gap="sm" className="px-lg py-xs">
            <div className="size-2.5 rounded-full bg-primary" />
            <Text as="div" variant="caption" className="font-semibold">
              Trip
            </Text>
          </Stack>
          <Stack gap="2xs" className="px-lg pb-sm">
            <MultiSpanLane
              label={snapshot.trigger.label}
              duration={formatDuration(snapshot.trigger.durationMs)}
              bars={[tripBar]}
              onBarClick={() => setSelected(tripSelection(snapshot))}
            />
          </Stack>
        </div>

        {sections.map(([classId, payload]) => (
          <Trace.Lane.Dispatch
            key={classId}
            classId={classId}
            payload={payload}
            trace={snapshot}
            onSelect={setSelected}
          />
        ))}
      </GanttContainer>

      <Sticky edge="bottom" layer="raised" className="border-t bg-muted/50">
        <DetailStrip selection={selected} />
      </Sticky>
    </Stack>
  );
}

function tripSelection(snapshot: TraceSnapshot): TraceSelection {
  const t = snapshot.trigger;
  return {
    title: `trip · ${t.kind}:${t.label}`,
    fields: [
      { label: "duration", value: formatDuration(t.durationMs) },
      { label: "threshold", value: formatDuration(t.thresholdMs) },
      { label: "over budget", value: t.thresholdMs > 0 ? `×${(t.durationMs / t.thresholdMs).toFixed(1)}` : "—" },
      { label: "worktree", value: snapshot.worktree },
    ],
  };
}

// The shared bottom strip: whatever lane last reported a selection, rendered
// generically (title + labelled fields). Class-agnostic — the pane never knows
// what produced it.
function DetailStrip({ selection }: { selection: TraceSelection | null }): ReactElement {
  return (
    <Text as="div" variant="caption" className="px-lg py-sm">
      {selection ? (
        <Stack direction="row" gap="md" wrap align="baseline">
          <span className="font-mono font-medium">{selection.title}</span>
          {selection.fields.map((f) => (
            <span key={f.label}>
              <span className="text-muted-foreground">{f.label}: </span>
              <span className="font-medium">{f.value}</span>
            </span>
          ))}
        </Stack>
      ) : (
        <span className="text-muted-foreground/60">Click a span or chip to see details.</span>
      )}
    </Text>
  );
}
