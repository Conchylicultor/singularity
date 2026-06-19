import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Gallery } from "./gallery";

export const layoutLabPane = Pane.define({
  id: "layout-lab",
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
