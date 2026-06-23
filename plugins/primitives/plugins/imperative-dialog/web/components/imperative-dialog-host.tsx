import { useSyncExternalStore } from "react";
import {
  Dialog,
  DialogContent,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { subscribe, getOpenDialogs, closeDialog } from "../internal/store";

/**
 * Global host for imperative dialogs. Mounted once via `Core.Root`; renders each
 * dialog pushed through `openDialog()` in a controlled modal `Dialog`.
 * `DialogContent` portals to document.body and carries the forwarded theme
 * scope, so a dialog opened from anywhere paints correctly. Closing (Escape /
 * backdrop / the render's `close()`) settles the `openDialog()` promise.
 */
export function ImperativeDialogHost() {
  const dialogs = useSyncExternalStore(
    subscribe,
    getOpenDialogs,
    getOpenDialogs,
  );
  return (
    <>
      {dialogs.map((d) => (
        <Dialog
          key={d.id}
          open
          onOpenChange={(open: boolean) => {
            if (!open) closeDialog(d.id);
          }}
        >
          <DialogContent>{d.node}</DialogContent>
        </Dialog>
      ))}
    </>
  );
}
