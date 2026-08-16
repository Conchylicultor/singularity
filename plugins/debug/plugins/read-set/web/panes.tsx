import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { ReadSetView } from "./components/read-set-view";

export const readSetPane = Pane.define({
  id: "debug-read-set",
  app: debugApp,
  segment: "read-set",
  component: ReadSetBody,
});

function ReadSetBody(): ReactElement {
  return (
    <PaneChrome pane={readSetPane} title="Read-set">
      <ReadSetView />
    </PaneChrome>
  );
}
