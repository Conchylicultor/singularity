import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { MemoryPanel } from "./components/memory-panel";

export const memoryPane = Pane.define({
  id: "debug-memory",
  app: debugApp,
  segment: "memory",
  component: MemoryBody,
});

function MemoryBody() {
  return (
    <PaneChrome pane={memoryPane} title="Memory">
      <MemoryPanel />
    </PaneChrome>
  );
}
