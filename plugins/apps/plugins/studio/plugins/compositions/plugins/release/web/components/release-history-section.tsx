import { useMemo, type ReactElement, type ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { useManifestItems } from "@plugins/plugin-meta/plugins/composition/web";
import {
  RELEASE_TARGETS,
  releaseHistoryResource,
  type ReleaseRun,
} from "@plugins/release/core";
import { releaseDetailPane } from "../panes";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const RELEASE_HISTORY_VIEW = defineDataView("studio.release.history");

// Closed status set (the `release_runs.status` enum), labelled for the enum
// filter chip and group-by.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
];

function statusBadge(run: ReleaseRun): ReactNode {
  if (run.status === "running") {
    return (
      <Badge variant="warning" icon={<StatusDot colorClass="bg-warning animate-pulse" />}>
        Running
      </Badge>
    );
  }
  if (run.status === "succeeded") {
    return (
      <Badge variant="success" icon={<StatusDot colorClass="bg-success" />}>
        Succeeded
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" icon={<StatusDot colorClass="bg-destructive" />}>
      Failed
    </Badge>
  );
}

function ReleaseHistoryTable({
  rows,
  loading,
  selectedRunId,
  onRunClick,
}: {
  rows: ReleaseRun[];
  loading: boolean;
  selectedRunId?: string;
  onRunClick: (runId: string) => void;
}): ReactElement {
  const fields: FieldDef<ReleaseRun>[] = useMemo(() => {
    // Platform is an open string set (e.g. "darwin-arm64"), so its enum options
    // come from the live rows — exactly what reports does for `source`.
    const platforms = [...new Set(rows.map((r) => r.platform).filter((p): p is string => !!p))]
      .sort()
      .map((p) => ({ value: p, label: p }));

    return [
      {
        id: "target",
        label: "Target",
        type: "enum",
        value: (r) => r.target,
        options: RELEASE_TARGETS.map((t) => ({ value: t.id, label: t.label })),
        cell: (r) => <Badge variant="muted">{r.target}</Badge>,
        primary: true,
        sortable: true,
        filterable: true,
        width: "9rem",
      },
      {
        id: "status",
        label: "Status",
        type: "enum",
        value: (r) => r.status,
        options: STATUS_OPTIONS,
        cell: (r) => statusBadge(r),
        sortable: true,
        filterable: true,
        width: "8rem",
      },
      {
        id: "platform",
        label: "Platform",
        type: "enum",
        value: (r) => r.platform,
        options: platforms,
        cell: (r) =>
          r.platform ? (
            <span className="font-mono text-muted-foreground">{r.platform}</span>
          ) : null,
        sortable: true,
        filterable: true,
        width: "10rem",
      },
      {
        id: "startedAt",
        label: "Started",
        type: "date",
        value: (r) => r.startedAt,
        cell: (r) => (
          <span className="text-muted-foreground">
            <RelativeTime date={r.startedAt} />
          </span>
        ),
        sortable: true,
        width: "8rem",
      },
      {
        id: "finishedAt",
        label: "Finished",
        type: "date",
        value: (r) => r.finishedAt,
        cell: (r) =>
          r.finishedAt ? (
            <span className="text-muted-foreground">
              <RelativeTime date={r.finishedAt} />
            </span>
          ) : null,
        sortable: true,
        width: "8rem",
      },
    ];
  }, [rows]);

  return (
    <DataView<ReleaseRun>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      views={["list", "table"]}
      defaultView="list"
      storageKey={RELEASE_HISTORY_VIEW}
      loading={loading}
      selectedRowId={selectedRunId}
      onRowActivate={(r) => onRunClick(r.id)}
      emptyState={<>No releases yet.</>}
    />
  );
}

export function ReleaseHistorySection({ id }: { id: string }): ReactElement {
  const openPane = useOpenPane();
  const name = useManifestItems().find((it) => it.id === id)?.name;
  const selectedRunId = releaseDetailPane.useRouteEntry()?.params.runId;
  const result = useResource(releaseHistoryResource);

  const table = (rows: ReleaseRun[], loading: boolean) => (
    <ReleaseHistoryTable
      rows={name === undefined ? [] : rows.filter((r) => r.composition === name)}
      loading={loading}
      selectedRunId={selectedRunId}
      onRunClick={(runId) => openPane(releaseDetailPane, { runId }, { mode: "push" })}
    />
  );

  return (
    <Stack gap="sm">
      {/* One render path for both states (mirrors the reports/sonata-library
          precedent): while loading, DataView renders its own skeleton via
          `loading` and the field schema is still built from the (empty) rows. */}
      {matchResource(result, {
        pending: () => table([], true),
        error: () => table([], true),
        ready: (runs) => table(runs, false),
      })}
      <Text as="p" variant="caption" className="text-muted-foreground">
        Showing this composition&apos;s runs from the 50 most recent overall.
      </Text>
    </Stack>
  );
}
