import type { ReactElement } from "react";
import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { ExhibitsGallery } from "./exhibits-gallery";

export const exhibitsPane = Pane.define({
  title: "Exhibits",
  route: defineRoute({
    id: "exhibits",
    segment: "exhibits",
  }),
  app: debugApp,
  component: ExhibitsBody,
});

function ExhibitsBody(): ReactElement {
  return (
    <PaneChrome pane={exhibitsPane}>
      <ExhibitsGallery />
    </PaneChrome>
  );
}
