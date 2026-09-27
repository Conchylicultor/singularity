import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { TerminalPaneBody } from "./components/terminal-pane-body";

export const convTerminalPane = Pane.define({
  route: defineRoute({
    id: "conv-terminal",
    segment: "terminal",
  }),
  app: agentManagerApp,
  title: "Terminal",
  component: ConvTerminalBody,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { keepMountedWhenCollapsed: true, promote: false },
});

function ConvTerminalBody() {
  return (
    <PaneChrome pane={convTerminalPane}>
      <TerminalPaneBody />
    </PaneChrome>
  );
}
