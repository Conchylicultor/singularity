import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ReadSetView } from "./components/read-set-view";

export const readSetPane = Pane.define({
  id: "debug-read-set",
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
