import { useMemo, type ReactElement } from "react";
import {
  foldResource,
  useEndpointResource,
} from "@plugins/primitives/plugins/live-state/web";
import type { ResourceReadiness } from "@plugins/primitives/plugins/live-state/core";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
} from "@plugins/primitives/plugins/data-view/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { listBootTraces } from "../../shared/endpoints";
import { bootProfileDetailPane } from "../panes";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const BOOT_PROFILES_VIEW = defineDataView("debug.boot-profiles");

// One saved-snapshot metadata row (the list endpoint's item shape — no blob).
type BootTraceItem = {
  id: string;
  worktree: string;
  createdAt: string;
};

// Browse pane: lists saved snapshots (metadata only — no blob), each row opening
// the detail pane. Fetched on open (NOT polled); saved traces only change on an
// explicit Copy permalink click or the 30-day sweep.
export function BootProfileList(): ReactElement {
  const traces = useEndpointResource(listBootTraces, {});
  // The DataView renders the loading and failed states (`readiness`); only a
  // ready read's rows reach the view.
  const rows = foldResource(traces, {
    loading: () => NO_TRACES,
    error: () => NO_TRACES,
    ready: (d) => d.items,
  });
  return <BootProfileTable rows={rows} readiness={traces} />;
}

const NO_TRACES: readonly BootTraceItem[] = [];

function BootProfileTable({
  rows,
  readiness,
}: {
  rows: readonly BootTraceItem[];
  readiness: ResourceReadiness;
}): ReactElement {
  const openPane = useOpenPane();

  const fields: FieldDef<BootTraceItem>[] = useMemo(
    () => [
      {
        id: "worktree",
        label: "Worktree",
        type: "text",
        value: (r) => r.worktree,
        primary: true,
        sortable: true,
        filterable: true,
      },
      {
        id: "id",
        label: "Id",
        type: "text",
        value: (r) => r.id,
        cell: (r) => (
          <span className="font-mono text-muted-foreground">{r.id}</span>
        ),
        sortable: false,
        filterable: false,
      },
      {
        id: "createdAt",
        label: "When",
        type: "date",
        value: (r) => new Date(r.createdAt),
        cell: (r) => (
          <span className="text-muted-foreground">
            <RelativeTime date={new Date(r.createdAt)} />
          </span>
        ),
        sortable: true,
        align: "end",
      },
    ],
    [],
  );

  return (
    <DataView<BootTraceItem>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      views={["list"]}
      storageKey={BOOT_PROFILES_VIEW}
      readiness={readiness}
      rowActivation={(r) =>
        openPane.to(bootProfileDetailPane, { id: r.id }, { mode: "push" })
      }
      emptyState={
        <>
          No saved boot traces yet. Use Copy permalink on the Boot Profile page
          to save one.
        </>
      }
    />
  );
}
