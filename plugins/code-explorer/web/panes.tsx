import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { ConvFileTreeBody } from "./components/conv-file-tree-body";
import { GlobalFileTreeBody } from "./components/global-file-tree-body";

const globalFileTreeRoute = defineRoute({
  id: "global-file-tree",
  segment: "code/:worktree",
});

const convFileTreeRoute = defineRoute({
  id: "conv-file-tree",
  segment: "files",
});

export const globalFileTreePane = Pane.define({
  route: globalFileTreeRoute,
  app: agentManagerApp,
  component: GlobalFileTreeChromedBody,
  resolve: false,
});

export const convFileTreePane = Pane.define({
  route: convFileTreeRoute,
  app: agentManagerApp,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvFileTreeChromedBody,
  width: 280,
});

function GlobalFileTreeChromedBody() {
  const { worktree } = globalFileTreePane.useParams();
  return (
    <PaneChrome pane={globalFileTreePane} title={`Files · ${worktree}`}>
      <GlobalFileTreeBody />
    </PaneChrome>
  );
}

function ConvFileTreeChromedBody() {
  return (
    <PaneChrome pane={convFileTreePane} title="Files">
      <ConvFileTreeBody />
    </PaneChrome>
  );
}
