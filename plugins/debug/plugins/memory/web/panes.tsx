import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { MemoryPanel } from "./components/memory-panel";

export const memoryPane = Pane.define({
  title: "Memory",
  route: defineRoute({ id: "debug-memory", segment: "memory" }),
  app: debugApp,
  component: MemoryBody,
});

function MemoryBody() {
  return (
    <PaneChrome pane={memoryPane}>
      <MemoryPanel />
    </PaneChrome>
  );
}
