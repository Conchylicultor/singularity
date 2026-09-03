import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { PushProfilingPaneBody } from "./components/push-profiling-pane";

const convPushProfilingRoute = defineRoute({
  id: "conv-push-profiling",
  segment: "pp",
});

export const convPushProfilingPane = Pane.define({
  route: convPushProfilingRoute,
  app: agentManagerApp,
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
