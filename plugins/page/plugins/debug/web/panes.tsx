import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { PageDebugPanel } from "./components/page-debug-panel";

export const pageDebugPane = Pane.define({
  id: "page-debug",
  segment: "page-editor",
  component: PageDebugBody,
});

function PageDebugBody() {
  return (
    <PaneChrome pane={pageDebugPane} title="Page Editor">
      <PageDebugPanel />
    </PaneChrome>
  );
}
