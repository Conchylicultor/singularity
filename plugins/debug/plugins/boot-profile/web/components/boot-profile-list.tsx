import { useMemo, type ReactElement } from "react";
import {
  useEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
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
  const { data, error, isLoading } = useEndpoint(listBootTraces, {});

  if (error) {
    return (
      <Inset pad="lg">
        <Placeholder tone="error">{getEndpointErrorMessage(error)}</Placeholder>
      </Inset>
    );
  }

  return (
    <BootProfileTable rows={data?.items ?? []} loading={isLoading} />
  );
}

function BootProfileTable({
  rows,
  loading,
}: {
  rows: readonly BootTraceItem[];
  loading: boolean;
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
      loading={loading}
      onRowActivate={(r) =>
        openPane(bootProfileDetailPane, { id: r.id }, { mode: "push" })
      }
      emptyState={
        <>
          No saved boot traces yet. Use Copy permalink on the Boot Profile page to
          save one.
        </>
      }
    />
  );
}
