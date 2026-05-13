import { defineSlot } from "@core";
import type { PaneObject } from "./pane";

// Exported as `Pane` so docgen renders the slot label as `Pane.Register`,
// matching the convention used by Shell.Sidebar, Code.ToolbarButton, etc.
// Imported and re-exposed on the runtime `Pane` namespace in pane.ts.
export const Pane = {
  Register: defineSlot<{ pane: PaneObject<any, any, any> }>("pane.register", {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pane may be undefined at docgen time
    docLabel: (p) => p.pane?.id,
  }),
};
