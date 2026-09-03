import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { HeapPanel } from "./components/heap-panel";

const heapSnapshotRoute = defineRoute({
  id: "debug-heap-snapshot",
  segment: "heap",
});

export const heapSnapshotPane = Pane.define({
  route: heapSnapshotRoute,
  app: debugApp,
  component: HeapSnapshotBody,
});

function HeapSnapshotBody(): ReactElement {
  return (
    <PaneChrome pane={heapSnapshotPane} title="Heap">
      <HeapPanel />
    </PaneChrome>
  );
}
