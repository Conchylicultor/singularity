import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { serversResource, type Server } from "../../shared";
import { addServerPane, serverDetailPane } from "../panes";
import { ServerStatusBadge } from "./server-status-badge";

export function ServersList() {
  const { data: servers } = useResource(serversResource);
  const match = usePaneMatch();
  const selectedId = match?.chain.find(
    (e) => e.pane === serverDetailPane._internal,
  )?.params.serverId;
  const addingServer = match?.chain.some(
    (e) => e.pane === addServerPane._internal,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Servers</h2>
        <button
          onClick={() => addServerPane.open({})}
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
        {!servers || servers.length === 0 ? (
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
  return (
    <button
      onClick={() => serverDetailPane.open({ serverId: server.id })}
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
