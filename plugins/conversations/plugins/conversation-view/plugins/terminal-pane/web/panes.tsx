import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TerminalPaneBody } from "./components/terminal-pane-body";

export const convTerminalPane = Pane.define({
  id: "conv-terminal",
  parent: conversationPane,
  path: "terminal",
  component: ConvTerminalBody,
});

function ConvTerminalBody() {
  return (
    <PaneChrome pane={convTerminalPane} title="Terminal">
      <TerminalPaneBody />
    </PaneChrome>
  );
}
