import { MdClearAll } from "react-icons/md";
import { toast as sonnerToast } from "sonner";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { clearTrackedToasts, useLiveToastCount } from "../internal/live-toasts";

/**
 * "Dismiss all" affordance for the toast stack. Clearing a pile-up one toast at
 * a time (each click landing on a target that then slides down) is the failure
 * mode this exists to remove: `sonnerToast.dismiss()` with no id sweeps every
 * live toast, including the ones queued past `visibleToasts`.
 *
 * Visibility is a pure function of the live toast count — a single toast is
 * already one click away from gone, so the control stays out of the way until
 * the stack is actually plural, and retires the moment it isn't.
 *
 * That count comes from the plugin's own ledger, not from `useSonner()`: the
 * latter is a second copy of the toast list with a single, droppable pruning
 * path, so counting it lets the affordance outlive the stack it acts on. See
 * `internal/live-toasts`.
 */
export function DismissAllButton() {
  const count = useLiveToastCount();

  if (count < 2) return null;

  return (
    <ControlSizeProvider size="sm">
      <Button
        variant="outline"
        shape="pill"
        className="pointer-events-auto shadow-md"
        onClick={() => {
          sonnerToast.dismiss();
          clearTrackedToasts();
        }}
      >
        <MdClearAll />
        Dismiss all ({count})
      </Button>
    </ControlSizeProvider>
  );
}
