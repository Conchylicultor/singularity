import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Deploy } from "@plugins/apps/plugins/deploy/plugins/shell/web";
import { serversResource, type Server } from "../shared";
import { ServersList } from "./components/servers-list";
import { ServerDetail } from "./components/server-detail";
import { AddServerForm } from "./components/add-server-form";

export const serversRootPane = Pane.define({
  id: "deploy-servers",
  // Empty segment + `appPath` makes this the Deploy app's index pane: bare /deploy.
  segment: "",
  appPath: "/deploy",
  component: ServersRoot,
  chrome: false,
  width: 320,
});

export const addServerPane = Pane.define({
  id: "deploy-add-server",
  defaultAncestors: [serversRootPane],
  segment: "add",
  component: AddServerBody,
  chrome: { title: "Add Server" },
  width: 400,
});

function useResolveServer({ serverId }: { serverId: string }) {
  const result = useResource(serversResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((s) => s.id === serverId) };
}

export const serverDetailPane = Pane.define({
  id: "deploy-server-detail",
  defaultAncestors: [serversRootPane],
  segment: "s/:serverId",
  component: ServerDetailBody,
  resolve: useResolveServer,
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

  if (serversResult.pending) {
    return (
      <PaneChrome pane={serverDetailPane} title="Server">
        <Loading variant="rows" />
      </PaneChrome>
    );
  }

  const server = serversResult.data.find((s) => s.id === serverId) ?? null;

  if (!server) {
    return (
      <PaneChrome pane={serverDetailPane} title="Server">
        <Text as="div" variant="body" className="text-muted-foreground p-lg">Server not found.</Text>
      </PaneChrome>
    );
  }

  return (
    <PaneChrome pane={serverDetailPane} title={server.name}>
      <ServerDetailContent serverId={serverId} server={server} />
    </PaneChrome>
  );
}

function ServerDetailContent({ serverId, server }: { serverId: string; server: Server }) {
  return (
    <>
      <ServerDetail server={server} />
      <div className="flex flex-col gap-lg p-lg">
        <Deploy.Section.Render>
          {(s) => (
            <section key={s.id} className="bg-card rounded-lg border p-lg">
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- section title offset inside a bg/border/padded card, not a flex-gap sibling */}
              <Text as="h2" variant="label" className="mb-3">{s.title}</Text>
              <s.component serverId={serverId} />
            </section>
          )}
        </Deploy.Section.Render>
      </div>
    </>
  );
}
