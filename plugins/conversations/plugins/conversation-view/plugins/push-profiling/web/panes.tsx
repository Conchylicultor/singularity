import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { PushProfilingPaneBody } from "./components/push-profiling-pane";

export const convPushProfilingPane = Pane.define({
  id: "conv-push-profiling",
  app: agentManagerApp,
  segment: "pp",
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvPushProfilingBody,
  width: 600,
});

function ConvPushProfilingBody() {
  return (
    <PaneChrome pane={convPushProfilingPane} title="Op Profiling">
      <PushProfilingPaneBody />
    </PaneChrome>
  );
}
