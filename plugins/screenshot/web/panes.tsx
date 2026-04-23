import { Pane } from "@plugins/pane/web";
import { ScreenshotView } from "./components/screenshot-view";

export const screenshotPane = Pane.define({
  id: "screenshot",
  path: "/screenshot/:id",
  component: ScreenshotBody,
});

function ScreenshotBody() {
  const { id } = screenshotPane.useParams();
  return <ScreenshotView id={id} />;
}
