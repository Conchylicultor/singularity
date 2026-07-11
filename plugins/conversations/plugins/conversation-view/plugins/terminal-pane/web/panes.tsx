import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { TerminalPaneBody } from "./components/terminal-pane-body";

export const convTerminalPane = Pane.define({
  id: "conv-terminal",
  segment: "terminal",
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
