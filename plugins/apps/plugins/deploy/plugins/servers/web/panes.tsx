import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Deploy } from "@plugins/apps/plugins/deploy/plugins/shell/web";
import { serversResource, type Server } from "../shared";
import { ServersList } from "./components/servers-list";
import { ServerEditForm } from "./components/server-edit-form";
import { ServerCreateForm } from "./components/server-create-form";

/**
 * Sentinel `:serverId` for the create state of the unified server pane. Real
 * ids are `srv-…`, so this can never collide with an existing server.
 */
export const NEW_SERVER_ID = "new";

export const serversRootPane = Pane.define({
  id: "deploy-servers",
  // Empty segment + `appPath` makes this the Deploy app's index pane: bare /deploy.
  segment: "",
  appPath: "/deploy",
  component: ServersRoot,
  width: 320,
});

function useResolveServer({ serverId }: { serverId: string }) {
  const result = useResource(serversResource);
  if (serverId === NEW_SERVER_ID) return { pending: false, found: true };
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((s) => s.id === serverId) };
}

// Single unified server pane: `server/new` is the add form, `server/:id` is the
// same page in edit mode. One route serves both, so adding and editing a server
// are the same surface.
export const serverDetailPane = Pane.define({
  id: "deploy-server-detail",
  defaultAncestors: [serversRootPane],
  segment: "server/:serverId",
  component: ServerDetailBody,
  resolve: useResolveServer,
  width: 420,
});

function ServersRoot() {
  return (
    <PaneChrome pane={serversRootPane} title="Servers">
      <ServersList />
    </PaneChrome>
  );
}

function ServerDetailBody() {
  const { serverId } = serverDetailPane.useParams();
  const openPane = useOpenPane();
  const serversResult = useResource(serversResource);

  if (serverId === NEW_SERVER_ID) {
    return (
      <PaneChrome pane={serverDetailPane} title="Add Server">
        <ServerCreateForm
          // `swap` replaces the create state with the real server in place — no
          // new column, so the pane transitions add → edit seamlessly.
          onCreated={(id) =>
            openPane(serverDetailPane, { serverId: id }, { mode: "swap" })
          }
        />
      </PaneChrome>
    );
  }

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
      <ServerEditForm server={server} />
      <Stack gap="lg" className="p-lg">
        <Deploy.Section.Render>
          {(s) => (
            <Surface key={s.id} level="raised" as="section" className="p-lg">
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- section title offset inside a bg/border/padded card, not a flex-gap sibling */}
              <Text as="h2" variant="label" className="mb-3">{s.title}</Text>
              <s.component serverId={serverId} />
            </Surface>
          )}
        </Deploy.Section.Render>
      </Stack>
    </>
  );
}
