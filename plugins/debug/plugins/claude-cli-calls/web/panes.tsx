import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { CallsView } from "./components/calls-view";

export const claudeCliCallsPane = Pane.define({
  id: "claude-cli-calls",
  after: [null],
  segment: "debug/claude-cli-calls",
  component: CallsBody,
});

function CallsBody() {
  return (
    <PaneChrome pane={claudeCliCallsPane} title="Claude CLI Calls">
      <CallsView />
    </PaneChrome>
  );
}
