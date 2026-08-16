import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { Gallery } from "./gallery";

export const layoutLabPane = Pane.define({
  id: "layout-lab",
  app: debugApp,
  segment: "layout-lab",
  component: LayoutLabBody,
});

function LayoutLabBody(): ReactElement {
  return (
    <PaneChrome pane={layoutLabPane} title="Layout Lab">
      <Gallery />
    </PaneChrome>
  );
}
