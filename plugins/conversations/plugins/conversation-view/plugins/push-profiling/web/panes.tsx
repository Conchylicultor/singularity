import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { PushProfilingPaneBody } from "./components/push-profiling-pane";

export const convPushProfilingPane = Pane.define({
  route: defineRoute({
    id: "conv-push-profiling",
    segment: "pp",
  }),
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
