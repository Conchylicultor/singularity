import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { Gallery } from "./gallery";

const layoutLabRoute = defineRoute({
  id: "layout-lab",
  segment: "layout-lab",
});

export const layoutLabPane = Pane.define({
  route: layoutLabRoute,
  app: debugApp,
  component: LayoutLabBody,
});

function LayoutLabBody(): ReactElement {
  return (
    <PaneChrome pane={layoutLabPane} title="Layout Lab">
      <Gallery />
    </PaneChrome>
  );
}
