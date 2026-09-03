import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { TerminalPaneBody } from "./components/terminal-pane-body";

const convTerminalRoute = defineRoute({
  id: "conv-terminal",
  segment: "terminal",
});

export const convTerminalPane = Pane.define({
  route: convTerminalRoute,
  app: agentManagerApp,
  component: ConvTerminalBody,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { keepMountedWhenCollapsed: true, promote: false },
});

function ConvTerminalBody() {
  return (
    <PaneChrome pane={convTerminalPane} title="Terminal">
      <TerminalPaneBody />
    </PaneChrome>
  );
}
