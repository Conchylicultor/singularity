import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { ScreenshotView } from "./components/screenshot-view";

export const screenshotPane = Pane.define({
  id: "screenshot",
  app: agentManagerApp,
  segment: "screenshot/:id",
  component: ScreenshotBody,
  resolve: false,
});

function ScreenshotBody() {
  const { id } = screenshotPane.useParams();
  return (
    <PaneChrome pane={screenshotPane} title="Screenshot">
      <ScreenshotView id={id} />
    </PaneChrome>
  );
}
