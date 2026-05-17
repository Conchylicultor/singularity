import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, type, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Deploy } from "@plugins/apps/plugins/deploy/plugins/shell/web";
import { serversResource, type Server } from "../shared";
import { ServersList } from "./components/servers-list";
import { ServerDetail } from "./components/server-detail";
import { AddServerForm } from "./components/add-server-form";

export const serversRootPane = Pane.define({
  id: "deploy-servers",
  after: [null],
  segment: "deploy",
  component: ServersRoot,
  chrome: false,
  width: 320,
});

export const addServerPane = Pane.define({
  id: "deploy-add-server",
  after: [serversRootPane],
  segment: "add",
  component: AddServerBody,
  chrome: { title: "Add Server" },
  width: 400,
});

export const serverDetailPane = Pane.define({
  id: "deploy-server-detail",
  after: [serversRootPane],
  segment: "s/:serverId",
  component: ServerDetailBody,
  provides: type<{ server: Server }>(),
});

function ServersRoot() {
  return (
    <div className="h-full overflow-auto">
      <ServersList />
    </div>
  );
}

function AddServerBody() {
  const openPane = useOpenPane();
  return (
    <PaneChrome pane={addServerPane}>
      <AddServerForm
        onSuccess={(id) => openPane(serverDetailPane, { serverId: id }, { mode: "push" })}
      />
    </PaneChrome>
  );
}

function ServerDetailBody() {
  const { serverId } = serverDetailPane.useParams();
  const serversResult = useResource(serversResource);
  const server = serversResult.pending ? null : (serversResult.data.find((s) => s.id === serverId) ?? null);

  if (!server) {
    return (
      <PaneChrome pane={serverDetailPane} title="Server">
        <div className="text-muted-foreground p-4 text-sm">Loading…</div>
      </PaneChrome>
    );
  }

  return (
    <serverDetailPane.Provider value={{ server }}>
      <PaneChrome pane={serverDetailPane} title={server.name}>
        <ServerDetailContent serverId={serverId} />
      </PaneChrome>
    </serverDetailPane.Provider>
  );
}

function ServerDetailContent({ serverId }: { serverId: string }) {
  const sections = Deploy.Section.useContributions();
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="h-full overflow-auto">
      <ServerDetail />
      <div className="flex flex-col gap-4 p-4">
        {sorted.map((s) => (
          <section key={s.id} className="bg-card rounded-lg border p-4">
            <h2 className="mb-3 text-sm font-medium">{s.title}</h2>
            <s.component serverId={serverId} />
          </section>
        ))}
      </div>
    </div>
  );
}
