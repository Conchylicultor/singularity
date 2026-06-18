import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { HeapPanel } from "./components/heap-panel";

export const heapSnapshotPane = Pane.define({
  id: "debug-heap-snapshot",
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
