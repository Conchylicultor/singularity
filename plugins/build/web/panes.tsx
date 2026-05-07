import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { BuildPopoverContent } from "./components/build-popover-content";

export const buildPane = Pane.define({
  id: "build",
  after: [null],
  segment: "build",
  component: BuildPaneBody,
});

function BuildPaneBody(): ReactElement {
  return (
    <PaneChrome pane={buildPane} title="Build">
      <BuildPopoverContent variant="pane" />
    </PaneChrome>
  );
}
