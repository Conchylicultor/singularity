import { useMemo } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { serversResource, type Server } from "../../shared";
import { addServerPane, serverDetailPane } from "../panes";
import { ServerStatusBadge } from "./server-status-badge";
import { ServerItemActions } from "./server-item-actions";

const SERVERS_VIEW = defineDataView("deploy.servers");

export function ServersList() {
  const result = useResource(serversResource);
  const openPane = useOpenPane();
  const selectedId = serverDetailPane.useRouteEntry()?.params.serverId;

  const fields: FieldDef<Server>[] = useMemo(
    () => [
      { id: "name", label: "Name", type: "text", primary: true, value: (s) => s.name },
      {
        id: "address",
        label: "Address",
        type: "text",
        value: (s) => `${s.host}:${s.port}`,
      },
      {
        id: "status",
        label: "Status",
        type: "enum",
        align: "end",
        options: [
          { value: "online", label: "Online" },
          { value: "offline", label: "Offline" },
          { value: "unknown", label: "Unknown" },
        ],
        value: (s) => s.status,
        cell: (s) => <ServerStatusBadge status={s.status} />,
      },
    ],
    [],
  );

  // One render path for both states: while loading, DataView renders its
  // skeleton (`loading`) and the chrome (search / + Add) stays stable — the
  // "No servers registered" empty state requires confirmed-empty.
  const renderList = (servers: Server[], loading: boolean) => (
    <DataView<Server>
      rows={servers}
      fields={fields}
      rowKey={(s) => s.id}
      views={["list"]}
      defaultView="list"
      storageKey={SERVERS_VIEW}
      loading={loading}
      itemActions={ServerItemActions}
      selectedRowId={selectedId}
      onRowActivate={(s) => openPane(serverDetailPane, { serverId: s.id }, { mode: "push" })}
      actions={
        <Button
          variant="default"
          onClick={() => openPane(addServerPane, {}, { mode: "push" })}
        >
          + Add
        </Button>
      }
      emptyState="No servers registered. Add one to get started."
    />
  );

  return matchResource(result, {
    pending: () => renderList([], true),
    error: () => renderList([], true),
    ready: (servers) => renderList(servers, false),
  });
}
