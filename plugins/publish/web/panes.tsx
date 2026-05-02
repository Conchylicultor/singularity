import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { PublishView } from "./components/publish-view";

export const publishPane = Pane.define({
  id: "publish",
  path: "/publish",
  component: PublishBody,
});

function PublishBody() {
  return (
    <PaneChrome pane={publishPane} title="Publish">
      <PublishView />
    </PaneChrome>
  );
}
