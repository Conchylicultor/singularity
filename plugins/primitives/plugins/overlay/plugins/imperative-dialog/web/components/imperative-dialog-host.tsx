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
 * outside press / the render's `close()`) settles the `openDialog()` promise.
 *
 * `dismissible` is the one option that belongs on the ROOT rather than on the
 * panel — base-ui decides the outside press, so it is split off here and the
 * rest of the options spread onto `DialogContent` as presentation.
 */
export function ImperativeDialogHost() {
  const dialogs = useSyncExternalStore(
    subscribe,
    getOpenDialogs,
    getOpenDialogs,
  );
  return (
    <>
      {dialogs.map((d) => {
        const { dismissible = true, ...content } = d.options ?? {};
        return (
          <Dialog
            key={d.id}
            open
            disablePointerDismissal={!dismissible}
            onOpenChange={(open: boolean) => {
              if (!open) closeDialog(d.id);
            }}
          >
            <DialogContent {...content}>{d.node}</DialogContent>
          </Dialog>
        );
      })}
    </>
  );
}
