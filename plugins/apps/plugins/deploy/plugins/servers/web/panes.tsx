import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  Pane,
  PaneChrome,
  useOpenPane,
} from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { deployApp } from "@plugins/apps/plugins/deploy/plugins/shell/core";
import { serversResource } from "../shared";
import { ServersList } from "./components/servers-list";
import { ServerCreateForm } from "./components/server-create-form";
import { ServerDetail } from "./slots";

/**
 * Sentinel `:serverId` for the create state of the unified server pane. Real
 * ids are `srv-…`, so this can never collide with an existing server.
 */
export const NEW_SERVER_ID = "new";

export const serversRootPane = Pane.define({
  id: "deploy-servers",
  app: deployApp,
  // The Deploy app's index/landing pane — what its bare root (/deploy)
  // resolves to.
  appIndex: true,
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
  app: deployApp,
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
        <Text as="div" variant="body" className="text-muted-foreground p-lg">
          Server not found.
        </Text>
      </PaneChrome>
    );
  }

  // The whole pane body is the one section slot: identity, SSH setup and
  // deployments are peer contributions, and the host owns all of the chrome.
  return (
    <PaneChrome pane={serverDetailPane} title={server.name}>
      <ServerDetail.Host server={server} />
    </PaneChrome>
  );
}
