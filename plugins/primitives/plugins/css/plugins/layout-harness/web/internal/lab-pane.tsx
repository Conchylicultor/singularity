import type { ReactElement } from "react";
import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { Gallery } from "./gallery";

export const layoutLabPane = Pane.define({
  title: "Layout Lab",
  route: defineRoute({
    id: "layout-lab",
    segment: "layout-lab",
  }),
  app: debugApp,
  component: LayoutLabBody,
});

function LayoutLabBody(): ReactElement {
  return (
    <PaneChrome pane={layoutLabPane}>
      <Gallery />
    </PaneChrome>
  );
}
