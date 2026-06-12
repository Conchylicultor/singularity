import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { serversResource, type Server } from "../../shared";
import { addServerPane, serverDetailPane } from "../panes";
import { ServerStatusBadge } from "./server-status-badge";

export function ServersList() {
  const serversResult = useResource(serversResource);
  const openPane = useOpenPane();
  const selectedId = serverDetailPane.useRouteEntry()?.params.serverId;

  if (serversResult.pending) return <Loading />;

  const servers = serversResult.data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-lg py-md">
        <Text as="h2" variant="label">Servers</Text>
        <Button
          variant="default"
          size="sm"
          onClick={() => openPane(addServerPane, {}, { mode: "push" })}
        >
          + Add
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {servers.length === 0 ? (
          <Text as="div" variant="body" className="text-muted-foreground p-lg">
            No servers registered. Add one to get started.
          </Text>
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
      className={`flex items-center gap-md px-lg py-sm text-left transition-colors ${
        selected ? "bg-accent" : "hover:bg-accent/50"
      }`}
    >
      <div className="min-w-0 flex-1">
        <Text as="div" variant="label" className="truncate">{server.name}</Text>
        <Text as="div" variant="caption" className="text-muted-foreground truncate">
          {server.host}:{server.port}
        </Text>
      </div>
      <ServerStatusBadge status={server.status} />
    </button>
  );
}
