import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { serversResource, type Server } from "../../shared";
import { addServerPane, serverDetailPane } from "../panes";
import { ServerStatusBadge } from "./server-status-badge";

export function ServersList() {
  const { data: servers } = useResource(serversResource);
  const openPane = useOpenPane();
  const selectedId = serverDetailPane.useChainEntry()?.params.serverId;
  const addingServer = addServerPane.useChainEntry() !== null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Servers</h2>
        <button
          onClick={() => openPane(addServerPane, {}, { mode: "push" })}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            addingServer
              ? "bg-accent text-accent-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          + Add
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {servers.length === 0 ? (
          <div className="text-muted-foreground p-4 text-sm">
            No servers registered. Add one to get started.
          </div>
        ) : (
          <div className="flex flex-col">
            {servers.map((server) => (
              <ServerRow
                key={server.id}
                server={server}
                selected={server.id === selectedId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServerRow({ server, selected }: { server: Server; selected: boolean }) {
  const openPane = useOpenPane();
  return (
    <button
      onClick={() => openPane(serverDetailPane, { serverId: server.id }, { mode: "push" })}
      className={`flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        selected ? "bg-accent" : "hover:bg-accent/50"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{server.name}</div>
        <div className="text-muted-foreground truncate text-xs">
          {server.host}:{server.port}
        </div>
      </div>
      <ServerStatusBadge status={server.status} />
    </button>
  );
}
