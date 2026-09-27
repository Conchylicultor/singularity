import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { ScreenshotView } from "./components/screenshot-view";

export const screenshotPane = Pane.define({
  title: "Screenshot",
  route: defineRoute({
    id: "screenshot",
    segment: "screenshot/:id",
  }),
  app: agentManagerApp,
  component: ScreenshotBody,
  resolve: false,
});

function ScreenshotBody() {
  const { id } = screenshotPane.useParams();
  return (
    <PaneChrome pane={screenshotPane}>
      <ScreenshotView id={id} />
    </PaneChrome>
  );
}
