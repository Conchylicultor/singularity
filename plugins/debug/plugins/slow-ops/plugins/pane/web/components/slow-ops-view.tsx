import { useMemo, type ReactElement } from "react";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  slowOpsResource,
  type SlowOp,
  type CallerBreakdown,
} from "@plugins/debug/plugins/slow-ops/core";

const SLOW_OPS_LOCAL = defineDataView("debug.slow-ops.local");

function CallerBreakdownLines({ callers }: { callers: CallerBreakdown[] }): ReactElement {
  const sorted = [...callers].sort((a, b) => b.totalMs - a.totalMs);
  return (
    <Stack gap="2xs" className="pl-md">
      {sorted.map((c) => (
        <span
          key={`${c.kind}:${c.label}`}
          className="truncate font-mono text-3xs text-muted-foreground"
          title={`${c.kind}:${c.label}`}
        >
          ↳ {c.kind}:{c.label} ×{c.count} ({Math.round(c.totalMs)} ms)
        </span>
      ))}
    </Stack>
  );
}

// The durable wait-vs-work split beneath an operation: ⏳ heavy-read-acquire
// 3500ms. Surfaces head-of-line blocking / lock-vs-work without manual repro.
function WaitBreakdownLines({ waits }: { waits: Record<string, number> }): ReactElement {
  const sorted = Object.entries(waits).sort((a, b) => b[1] - a[1]);
  return (
    <Stack gap="2xs" className="pl-md">
      {sorted.map(([layer, ms]) => (
        <span
          key={layer}
          className="truncate font-mono text-3xs text-muted-foreground"
          title={`${layer}: ${Math.round(ms)}ms wait`}
        >
          ⏳ {layer} {Math.round(ms)} ms
        </span>
      ))}
    </Stack>
  );
}

const sumWaits = (waits: Record<string, number>): number =>
  Object.values(waits).reduce((a, b) => a + b, 0);

export function SlowOpsView() {
  const result = useResource(slowOpsResource);
  return (
    <ResourceView resource={result} fallback={<Loading />}>
      {(ops) => <SlowOpsViewInner ops={ops} />}
    </ResourceView>
  );
}

function SlowOpsViewInner({ ops }: { ops: SlowOp[] }) {
  // Default ranking: aggregate impact (total time across all occurrences). A
  // structural bottleneck — one query draining many routes — surfaces at the top.
  const data = useMemo(() => [...ops].sort((a, b) => b.totalMs - a.totalMs), [ops]);

  const fields = useMemo<FieldDef<SlowOp>[]>(() => {
    const kinds = Array.from(new Set(data.map((r) => r.operationKind)));
    return [
      {
        id: "operationKind",
        label: "Kind",
        type: "enum",
        value: (r) => r.operationKind,
        options: kinds.map((k) => ({ value: k, label: k })),
        width: "7rem",
      },
      {
        id: "operation",
        label: "Operation",
        type: "text",
        primary: true,
        value: (r) => r.operation,
        width: "minmax(0,1fr)",
        cell: (r) => (
          // eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf of the data-view cell's grid; min-w-0 lets the truncating operation row shrink
          <Stack gap="2xs" className="min-w-0">
            <Text as="span" variant="caption" className="truncate font-mono" title={r.operation}>
              {r.operation}
            </Text>
            {r.callers.length > 0 && <CallerBreakdownLines callers={r.callers} />}
            {Object.keys(r.waits).length > 0 && <WaitBreakdownLines waits={r.waits} />}
          </Stack>
        ),
      },
      {
        id: "count",
        label: "Count",
        type: "number",
        value: (r) => r.count,
        align: "end",
        width: "4rem",
      },
      {
        id: "totalMs",
        label: "Total (ms)",
        type: "number",
        value: (r) => Math.round(r.totalMs),
        align: "end",
        width: "5.5rem",
      },
      {
        id: "waitMs",
        label: "Wait (ms)",
        type: "number",
        value: (r) => Math.round(sumWaits(r.waits)),
        align: "end",
        width: "5.5rem",
      },
      {
        id: "maxMs",
        label: "Max (ms)",
        type: "number",
        value: (r) => Math.round(r.maxMs),
        align: "end",
        width: "5rem",
      },
      {
        id: "lastMs",
        label: "Last (ms)",
        type: "number",
        value: (r) => Math.round(r.lastMs),
        align: "end",
        width: "5rem",
      },
      {
        id: "lastSeen",
        label: "Last seen",
        type: "date",
        value: (r) => r.lastSeenAt,
        cell: (r) => <RelativeTime date={r.lastSeenAt} />,
        align: "end",
        width: "7rem",
      },
    ];
  }, [data]);

  return (
    <DataView<SlowOp>
      rows={data}
      fields={fields}
      rowKey={(r) => r.id}
      storageKey={SLOW_OPS_LOCAL}
      defaultView="table"
      emptyState="No slow operations recorded"
    />
  );
}
