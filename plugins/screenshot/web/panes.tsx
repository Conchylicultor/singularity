import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { ScreenshotView } from "./components/screenshot-view";

const screenshotRoute = defineRoute({
  id: "screenshot",
  segment: "screenshot/:id",
});

export const screenshotPane = Pane.define({
  route: screenshotRoute,
  app: agentManagerApp,
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
