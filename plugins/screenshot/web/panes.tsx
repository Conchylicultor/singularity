import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ScreenshotView } from "./components/screenshot-view";

export const screenshotPane = Pane.define({
  id: "screenshot",
  segment: "screenshot/:id",
  component: ScreenshotBody,
});

function ScreenshotBody() {
  const { id } = screenshotPane.useParams();
  return (
    <PaneChrome pane={screenshotPane} title="Screenshot">
      <ScreenshotView id={id} />
    </PaneChrome>
  );
}
