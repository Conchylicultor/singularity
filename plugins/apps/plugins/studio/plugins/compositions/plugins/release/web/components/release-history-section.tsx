import { type ReactElement, type ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useManifestItems } from "@plugins/plugin-meta/plugins/composition/web";
import {
  RELEASE_TARGETS,
  queryReleaseHistory,
  releaseRunsRevisionResource,
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

// The rows are server-paginated (only a window is ever loaded here), so the
// field schema is static — it derives nothing from the loaded rows. `platform`
// is a free string set whose full enumeration lives server-side, so it stays a
// sortable text column rather than a client-derived (and thus partial) enum
// filter.
const fields: FieldDef<ReleaseRun>[] = [
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
    cell: (r) =>
      r.platform ? (
        <span className="font-mono text-muted-foreground">{r.platform}</span>
      ) : null,
    sortable: true,
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

export function ReleaseHistorySection({ id }: { id: string }): ReactElement {
  const openPane = useOpenPane();
  const name = useManifestItems().find((it) => it.id === id)?.name;
  const selectedRunId = releaseDetailPane.useRouteEntry()?.params.runId;

  // The cheap scalar tick drives an in-place refetch of the loaded window; the
  // composition-scoped keyset query is the source of truth. While pending, hand
  // a null tick (no refetch) — the first settled `rev` then refreshes once.
  const tick = useResource(releaseRunsRevisionResource);
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  return (
    <DataView<ReleaseRun>
      storageKey={RELEASE_HISTORY_VIEW}
      rows={[]}
      fields={fields}
      rowKey={(r) => r.id}
      views={["list", "table"]}
      defaultView="list"
      selectedRowId={selectedRunId}
      onRowActivate={(r) => openPane(releaseDetailPane, { runId: r.id }, { mode: "push" })}
      emptyState={<>No releases yet.</>}
      // Until the manifest resolves the composition name we have nothing to
      // scope the query to; DataView renders its empty state until it settles.
      dataSource={
        name
          ? {
              changeTick,
              fetchPage: (args) =>
                fetchEndpoint(queryReleaseHistory, {}, { body: { ...args, composition: name } }),
            }
          : undefined
      }
    />
  );
}
