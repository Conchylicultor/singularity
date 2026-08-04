import { MdClearAll } from "react-icons/md";
import { toast as sonnerToast, useSonner } from "sonner";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * "Dismiss all" affordance for the toast stack. Clearing a pile-up one toast at
 * a time (each click landing on a target that then slides down) is the failure
 * mode this exists to remove: `sonnerToast.dismiss()` with no id sweeps every
 * live toast, including the ones queued past `visibleToasts`.
 *
 * Visibility is a pure function of the live toast count — a single toast is
 * already one click away from gone, so the control stays out of the way until
 * the stack is actually plural, and retires the moment it isn't.
 */
export function DismissAllButton() {
  const { toasts } = useSonner();
  const count = toasts.length;

  if (count < 2) return null;

  return (
    <ControlSizeProvider size="sm">
      <Button
        variant="outline"
        shape="pill"
        className="pointer-events-auto shadow-md"
        onClick={() => sonnerToast.dismiss()}
      >
        <MdClearAll />
        Dismiss all ({count})
      </Button>
    </ControlSizeProvider>
  );
}
