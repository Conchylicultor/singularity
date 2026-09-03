import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { CallsView } from "./components/calls-view";

const claudeCliCallsRoute = defineRoute({
  id: "claude-cli-calls",
  segment: "claude-cli-calls",
});

export const claudeCliCallsPane = Pane.define({
  route: claudeCliCallsRoute,
  app: debugApp,
  component: CallsBody,
});

function CallsBody() {
  return (
    <PaneChrome pane={claudeCliCallsPane} title="Claude CLI Calls">
      <CallsView />
    </PaneChrome>
  );
}
