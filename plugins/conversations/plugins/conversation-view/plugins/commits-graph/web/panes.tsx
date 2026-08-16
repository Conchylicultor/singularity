import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { CommitsGraphBody } from "./components/commits-graph-body";

export const convCommitsGraphPane = Pane.define({
  id: "conv-commits-graph",
  app: agentManagerApp,
  segment: "commits",
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
