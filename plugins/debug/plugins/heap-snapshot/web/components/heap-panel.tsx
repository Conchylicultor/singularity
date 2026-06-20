import { type ReactElement } from "react";
import {
  useEndpoint,
  useEndpointMutation,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { getHeapStats, captureHeapSnapshot } from "../../shared/endpoints";
import type { HeapStatsResponse } from "../../shared/endpoints";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

type TypeRow = HeapStatsResponse["types"][number];

// Sortable type → count table. Defaults to count-desc (already server-sorted);
// DataTable owns the sort state via the `value` accessors.
const COLUMNS: ColumnDef<TypeRow>[] = [
  { id: "type", header: "Object type", value: (r) => r.type },
  {
    id: "count",
    header: "Count",
    align: "end",
    width: "8rem",
    value: (r) => r.count,
    cell: (r) => r.count.toLocaleString(),
  },
];

export function HeapPanel(): ReactElement {
  // Cheap — fetched on open and via the Refresh button. NOT polled.
  const { data, error, refetch, isFetching } = useEndpoint(getHeapStats, {});

  // Heavy, manual-only dump. Blocks the backend event loop for seconds and
  // writes a large file — never auto-triggered.
  const capture = useEndpointMutation(captureHeapSnapshot);
  const result = capture.data;

  if (error) {
    return (
      <Inset pad="lg">
        <Placeholder tone="error">{getEndpointErrorMessage(error)}</Placeholder>
      </Inset>
    );
  }

  return (
    <Inset pad="lg">
      <Stack gap="xl">
        <Stack as="section" gap="sm">
          <Stack direction="row" align="center" gap="sm">
            <SectionLabel>Heap (bun:jsc heapStats)</SectionLabel>
            <Button
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </Stack>
          {data ? (
            <Text variant="caption" tone="muted">
              {`${data.physFootprintMb.toFixed(0)} MB footprint · ${data.heapSizeMb.toFixed(
                1,
              )} MB heap (cap ${data.heapCapacityMb.toFixed(
                1,
              )} MB) · ${data.objectCount.toLocaleString()} objects · ${data.types.length} types`}
            </Text>
          ) : (
            <Placeholder>Loading…</Placeholder>
          )}
        </Stack>

        <Stack as="section" gap="sm">
          <SectionLabel>Full heap snapshot (heavy)</SectionLabel>
          <Text variant="caption" tone="muted">
            Walks the entire object graph synchronously — blocks the backend event
            loop for seconds on a multi-GB heap and writes a large
            {" "}.heapsnapshot file to disk (V8 format). Load it offline in Chrome
            DevTools (Memory tab) or VS Code. Manual, on-demand only.
          </Text>
          <Stack direction="row" align="center" gap="sm">
            <Button
              variant="destructive"
              onClick={() => void capture.mutateAsync({})}
              disabled={capture.isPending}
            >
              {capture.isPending ? "Capturing…" : "Capture full snapshot"}
            </Button>
          </Stack>
          {result ? (
            <Text variant="caption" tone="muted">
              {`Wrote ${formatBytes(result.sizeBytes)} → ${result.path}`}
            </Text>
          ) : null}
        </Stack>

        {data ? (
          <DataTable
            data={data.types}
            columns={COLUMNS}
            rowKey={(r) => r.type}
            emptyLabel="No objects on the heap."
          />
        ) : null}
      </Stack>
    </Inset>
  );
}
