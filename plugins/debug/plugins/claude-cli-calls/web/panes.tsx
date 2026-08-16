import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { CallsView } from "./components/calls-view";

export const claudeCliCallsPane = Pane.define({
  id: "claude-cli-calls",
  app: debugApp,
  segment: "claude-cli-calls",
  component: CallsBody,
});

function CallsBody() {
  return (
    <PaneChrome pane={claudeCliCallsPane} title="Claude CLI Calls">
      <CallsView />
    </PaneChrome>
  );
}
