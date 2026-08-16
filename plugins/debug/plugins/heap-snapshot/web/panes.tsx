import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { HeapPanel } from "./components/heap-panel";

export const heapSnapshotPane = Pane.define({
  id: "debug-heap-snapshot",
  app: debugApp,
  segment: "heap",
  component: HeapSnapshotBody,
});

function HeapSnapshotBody(): ReactElement {
  return (
    <PaneChrome pane={heapSnapshotPane} title="Heap">
      <HeapPanel />
    </PaneChrome>
  );
}
