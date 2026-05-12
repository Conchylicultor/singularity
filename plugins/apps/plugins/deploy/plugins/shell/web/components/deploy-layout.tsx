import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { PaneBasePathContext } from "@plugins/primitives/plugins/pane/web";

export function DeployLayout() {
  return (
    <PaneBasePathContext.Provider value="">
      <main className="h-full min-h-0 overflow-hidden bg-muted/30">
        <MillerColumns />
      </main>
    </PaneBasePathContext.Provider>
  );
}
