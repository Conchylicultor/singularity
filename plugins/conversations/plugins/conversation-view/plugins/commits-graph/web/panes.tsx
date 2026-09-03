import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { CommitsGraphBody } from "./components/commits-graph-body";

const convCommitsGraphRoute = defineRoute({
  id: "conv-commits-graph",
  segment: "commits",
});

export const convCommitsGraphPane = Pane.define({
  route: convCommitsGraphRoute,
  app: agentManagerApp,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvCommitsGraphBody,
  width: 520,
});

function ConvCommitsGraphBody() {
  return (
    <PaneChrome pane={convCommitsGraphPane} title="Commits">
      <CommitsGraphBody />
    </PaneChrome>
  );
}
