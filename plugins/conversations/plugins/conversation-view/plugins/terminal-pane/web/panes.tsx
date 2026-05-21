import { Pane, PaneChrome, type } from "@plugins/primitives/plugins/pane/web";
import { TerminalPaneBody } from "./components/terminal-pane-body";

export const convTerminalPane = Pane.define({
  id: "conv-terminal",
  segment: "terminal",
  input: type<{ convId: string }>(),
  component: ConvTerminalBody,
  chrome: { keepMountedWhenCollapsed: true },
});

function ConvTerminalBody() {
  return (
    <PaneChrome pane={convTerminalPane} title="Terminal">
      <TerminalPaneBody />
    </PaneChrome>
  );
}
