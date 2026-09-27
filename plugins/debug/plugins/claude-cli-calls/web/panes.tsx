import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { CallsView } from "./components/calls-view";

export const claudeCliCallsPane = Pane.define({
  title: "Claude CLI Calls",
  route: defineRoute({
    id: "claude-cli-calls",
    segment: "claude-cli-calls",
  }),
  app: debugApp,
  component: CallsBody,
});

function CallsBody() {
  return (
    <PaneChrome pane={claudeCliCallsPane}>
      <CallsView />
    </PaneChrome>
  );
}
