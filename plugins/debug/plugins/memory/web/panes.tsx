import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { MemoryPanel } from "./components/memory-panel";

export const memoryPane = Pane.define({
  id: "debug-memory",
  after: [null],
  segment: "debug/memory",
  component: MemoryBody,
});

function MemoryBody() {
  return (
    <PaneChrome pane={memoryPane} title="Memory">
      <MemoryPanel />
    </PaneChrome>
  );
}
