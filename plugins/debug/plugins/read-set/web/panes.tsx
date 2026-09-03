import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { ReadSetView } from "./components/read-set-view";

const readSetRoute = defineRoute({
  id: "debug-read-set",
  segment: "read-set",
});

export const readSetPane = Pane.define({
  route: readSetRoute,
  app: debugApp,
  component: ReadSetBody,
});

function ReadSetBody(): ReactElement {
  return (
    <PaneChrome pane={readSetPane} title="Read-set">
      <ReadSetView />
    </PaneChrome>
  );
}
