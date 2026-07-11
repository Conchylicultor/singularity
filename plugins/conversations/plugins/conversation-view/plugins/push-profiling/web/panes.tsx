import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { PushProfilingPaneBody } from "./components/push-profiling-pane";

export const convPushProfilingPane = Pane.define({
  id: "conv-push-profiling",
  segment: "pp",
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvPushProfilingBody,
  width: 600,
});

function ConvPushProfilingBody() {
  return (
    <PaneChrome pane={convPushProfilingPane} title="Push Profiling">
      <PushProfilingPaneBody />
    </PaneChrome>
  );
}
